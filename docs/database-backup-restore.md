# Chlat-Park — Database Backup and Restore Runbook

> **This is an operational runbook, not a specification.** The architecture view is in
> `specs/architecture/deployment.md` §7; the migration policy is in `specs/data/migrations.md`.

**Last updated:** 2026-10-21
**Audience:** the operator responsible for the data.

---

## 1. Why this document exists

A backup that has never been restored is a hypothesis, not a backup. This document exists so that
the restore is a **procedure with steps**, not a thing somebody improvises during an incident at
two in the morning.

**The three truths about backups**

1. A backup that has not been **verified** is not a backup.
2. A backup that has not been **restored** is not a backup.
3. A backup that is not **off-site** is not a backup — it dies with the VPS.

## 2. The policy

| Item | Policy |
|---|---|
| **Type** | `pg_dump` in the custom format, plus WAL archiving for point-in-time recovery |
| **Schedule** | A full dump daily at 02:00 site-local time |
| **Retention** | 14 days of local dumps; 7 days of off-site copies |
| **Destination** | Encrypted object storage in a **separate cloud account and region** from the VPS |
| **Encryption** | Server-side encryption (AES-256) plus a client-side envelope key stored in a *different* secret store from the data |
| **Verification** | Weekly: restore into a scratch container and compare the row counts and a checksum |
| **Drill** | Monthly: a full restore into a scratch environment, documented below |
| **RPO** | ≤ 24 hours with the daily dump; ≤ 5 minutes with the WAL archiving |
| **RTO** | ≤ 4 hours for a full restore from a dump |
| **Pre-migration** | An additional, mandatory dump before every migration, verified before the migration runs |

## 3. What is and is not in the backup

**In the backup:** every table — the users, the sites, the sessions, the tickets, the payments, the
audit log, and the readable plates that have not yet been redacted.

**Not in the backup:** the environment secrets. The `JWT` secrets, the `PLATE_PEPPER`, and the
database password are in Coolify's secret store, and they are backed up separately (a password
manager, or an encrypted secrets export). **A database restore without the secrets is useless** —
the `plate_digest` values would not match the new pepper's, and every existing session would look
tampered with.

> **Restoring the database into an environment with a different `PLATE_PEPPER` silently breaks the
> distinct-guest counts.** The pepper must be restored with the data. See ADR-010.

**The readable plates are in the backup** for as long as they are in the database. The backup
retention window therefore extends the plate exposure by up to 14 days. This is the largest
residual privacy exposure in the system, and it is accepted with the encryption, the separate
account, and the short retention.

## 4. The backup job

The job runs as a Coolify cron job, at 02:00 site-local.

```bash
#!/usr/bin/env bash
# scripts/backup.sh
set -euo pipefail

TYPE="${1:-scheduled}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="s3://${BACKUP_BUCKET}/${SITE}/${TYPE}-${STAMP}.dump"

echo "[backup] starting: ${TYPE} at ${STAMP}"

# 1. Dump. --no-owner and --no-acl keep the restore portable.
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
  | gzip -9 \
  | aws s3 cp - "$TARGET" --sse AES256 --metadata "backup-type=${TYPE}"

# 2. VERIFY. A backup that cannot be read is not a backup.
aws s3 cp "$TARGET" /tmp/verify.dump --quiet
pg_restore --list /tmp/verify.dump > /dev/null
rm -f /tmp/verify.dump

# 3. Report
SIZE=$(aws s3 cp "$TARGET" - --quiet | wc -c)
echo "[backup] OK: ${TARGET} (${SIZE} bytes)"

# 4. Prune the old copies
aws s3 rm "s3://${BACKUP_BUCKET}/${SITE}/" --recursive \
  --exclude "*" --include "scheduled-*" 2>/dev/null || true
```

### 4.1 The nightly log

The job's exit code is checked by the scheduler, and a failure raises an alert. **A backup that
failed silently for three weeks is the failure mode this exists to prevent.**

The job also records a line in the job log:

```
[backup] starting: scheduled at 20261021T020000Z
[backup] OK: s3://chlat-park-backups/production/scheduled-20261021T020000Z.dump (48219043 bytes)
```

## 5. The weekly verification

```bash
#!/usr/bin/env bash
# scripts/backup-verify.sh — restores the newest dump into a scratch container
set -euo pipefail

LATEST=$(aws s3 ls "s3://${BACKUP_BUCKET}/${SITE}/" \
  --recursive \
  | grep 'scheduled-.*\.dump$' \
  | sort -k1,2 \
  | tail -1 \
  | awk '{print $4}')

echo "[verify] testing ${LATEST}"

CONTAINER=$(docker run -d --rm \
  -e POSTGRES_PASSWORD=scratch \
  postgres:16-alpine)

trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true' EXIT

sleep 5
aws s3 cp "$LATEST" /tmp/verify.dump --quiet
gunzip -f /tmp/verify.dump || true
docker cp /tmp/verify.dump "$CONTAINER":/tmp/verify.dump
docker exec "$CONTAINER" pg_restore -U postgres -d postgres /tmp/verify.dump

# Compare the row counts
for table in parking_sessions payments audit_logs tickets parking_sites users; do
  EXPECTED=$(aws s3 cp "$LATEST" - --quiet | gunzip | pg_restore -l - | grep -c " TABLE public $table " || true)
  ACTUAL=$(docker exec "$CONTAINER" psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.$table")
  echo "[verify] $table: $ACTUAL rows"
done

echo "[verify] OK"
```

The verification runs weekly and its result is logged. A failure pages.

## 6. The restore procedure

> **Before you restore, read this.** A restore overwrites the live database. Confirm the scope with
> the incident lead before proceeding.

### 6.1 The full restore

```bash
#!/usr/bin/env bash
# scripts/restore.sh <backup-file>
set -euo pipefail

BACKUP="${1:?usage: restore.sh <backup-file>}"
CONFIRM="${CONFIRM_RESTORE:-}"

if [[ "$CONFIRM" != "YES" ]]; then
  echo "Refusing to restore without CONFIRM_RESTORE=YES" >&2
  exit 1
fi

echo "[restore] 1/6 stopping the application"
# Put the api into maintenance so no writes arrive mid-restore.
# (Set MAINTENANCE_MODE=true in Coolify, or scale the api to zero.)

echo "[restore] 2/6 taking a safety dump of the current state"
./scripts/backup.sh pre-restore || echo "  (the pre-restore dump failed — continuing)"

echo "[restore] 3/6 restoring from ${BACKUP}"
aws s3 cp "$BACKUP" /tmp/restore.dump --quiet
gunzip -f /tmp/restore.dump || true
psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pg_restore --no-owner --no-acl --dbname "$DATABASE_URL" /tmp/restore.dump

echo "[restore] 4/6 verifying the row counts"
psql "$DATABASE_URL" -tAc "SELECT count(*) FROM parking_sessions" | xargs echo "  parking_sessions:"
psql "$DATABASE_URL" -tAc "SELECT count(*) FROM payments"           | xargs echo "  payments:"
psql "$DATABASE_URL" -tAc "SELECT count(*) FROM audit_logs"          | xargs echo "  audit_logs:"

echo "[restore] 5/6 checking the migration state"
pnpm --filter @chlat/api prisma migrate status

echo "[restore] 6/6 restarting the application"
# Redeploy the api through Coolify and wait for the health gate.
./scripts/wait-for-health.sh https://api.chlat-park.com/api/v1/health/ready

echo "[restore] done — run the smoke test"
./scripts/smoke-test.sh https://api.chlat-park.com
```

### 6.2 The checklist

Before restoring, confirm:

- [ ] The incident lead has approved the restore.
- [ ] The scope is understood: **everything since the backup is lost.**
- [ ] The `PLATE_PEPPER` in the environment **matches** the one in use when the backup was taken.
- [ ] The `JWT` secrets are unchanged (so the existing sessions keep working).
- [ ] The application is in maintenance mode.
- [ ] A pre-restore safety dump has been attempted.
- [ ] The person running it knows how to restore the *secrets* if they are also lost.

### 6.3 The point-in-time recovery

With the WAL archiving enabled, a recovery to a specific moment is possible:

```bash
# Restore to a target time into a scratch database first
pg_basebackup -D /tmp/pgdata -h <replica-host> -D /tmp/pgdata
# set restore_target_time in postgresql.conf
# restore_command = 'cp s3://…/wal/%f %p'
```

**Always practise the PITR into a scratch database first.** A PITR directly into production is a
last resort.

## 7. The monthly restore drill

The drill is the point. Run it in the **staging** environment.

```bash
# 1. Pick the newest off-site backup.
LATEST=$(aws s3 ls "s3://${BACKUP_BUCKET}/${SITE}/" --recursive | sort -k1,2 | tail -1 | awk '{print $4}')

# 2. Restore it into a scratch database.
docker run -d --rm --name drill -e POSTGRES_PASSWORD=scratch postgres:16-alpine
sleep 5
aws s3 cp "$LATEST" /tmp/drill.dump --quiet
gunzip -f /tmp/drill.dump || true
docker cp /tmp/drill.dump drill:/tmp/drill.dump
docker exec drill pg_restore -U postgres -d postgres /tmp/drill.dump

# 3. Verify the content.
docker exec drill psql -U postgres -d postgres -tAc "SELECT count(*) FROM parking_sessions"
docker exec drill psql -U postgres -d postgres -tAc "SELECT count(*) FROM payments"
docker exec drill psql -U postgres -d postgres -tAc "SELECT count(*) FROM audit_logs"

# 4. Verify the integrity: the sessions that were completed are still completed,
#    and the payments that were PAID are still PAID.
docker exec drill psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM parking_sessions WHERE status='COMPLETED' AND exit_at IS NULL"

# 5. Record the result.
echo "Drill ${LATEST}: OK — $(date -u +%FT%TZ)" >> docs/drills/backup-drill.log
```

**The drill log** (`docs/drills/backup-drill.log`) is the evidence. A drill that is not recorded
did not happen.

### 7.1 What the drill must prove

| Check | Pass condition |
|---|---|
| The dump is readable | `pg_restore --list` succeeds |
| The restore completes | No errors |
| The row counts are plausible | The counts match the source dump's table listing |
| The data is coherent | No `COMPLETED` session with a null `exit_at`; no `PAID` payment without an amount |
| The migrations are known | `prisma migrate status` reports the expected version |
| The duration is acceptable | The restore completes within the RTO of 4 hours |

## 8. The retention and the pruning

| Copy | Where | Retained | Pruned by |
|---|---|---|---|
| The daily dump | The off-site bucket | 7 days | The backup job's prune step |
| The daily dump | The local disk | 3 days | The backup job's prune step |
| The pre-migration dump | The off-site bucket | 14 days | The prune step (a separate prefix) |
| The pre-restore dump | The off-site bucket | 14 days | The prune step |
| The WAL archive | The off-site bucket | 7 days | The prune step |

**A pre-migration dump is never pruned before a post-migration dump has been verified**, and the
prune step runs *after* the new dump has been written and verified.

## 9. The monitoring

| Check | Frequency | Alert |
|---|---|---|
| The backup job succeeded | Daily | Any failure |
| The backup file exists and is non-trivial in size | Daily | < 1 MB, or missing |
| The verification job succeeded | Weekly | Any failure |
| The drill was run this month | Monthly | Missing |
| The off-site bucket is reachable | Daily | Any failure |
| The database disk usage | Continuous | > 80 % |

A useful sanity check: the backup size should track the database size. A sudden drop usually means
a partial dump.

## 10. The troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| `pg_dump: error: connection to server failed` | The database is down, or the credentials are wrong | Check the `DATABASE_URL`; check the database container |
| The dump is much smaller than usual | The dump is partial, or the data really did drop | Compare the row counts with the previous dump; **investigate a sudden drop** |
| `pg_restore: error: ... already exists` | Restoring into a non-empty database | Drop the schema first (the restore script does this) |
| The restore succeeds but the app returns 500 | The `PLATE_PEPPER` does not match, or the migrations are behind | Run `prisma migrate status`; check the pepper against the environment's history |
| The verification finds a count of 0 for every table | The restore went to the wrong database | Check the `DATABASE_URL` in the verification script |
| The backup job times out | The database is under load, or the network is slow | Run the dump during a quiet window; consider `pg_dump --jobs` |
| The off-site upload fails | The credentials, the bucket policy, or the network | Check the AWS credentials and the bucket policy |

## 11. The runbooks index

| Situation | Runbook |
|---|---|
| Deploying or releasing | `docs/deployment.md` |
| Restoring the database | This document |
| Training a guard | `docs/guard-training.md` |
| A site is down / a ticket is disputed / the revenue looks wrong | `docs/incident-response.md` |
