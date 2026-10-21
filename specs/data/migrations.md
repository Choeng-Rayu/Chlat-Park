# Chlat-Park — Migrations

**Status:** Accepted
**Last updated:** 2026-10-21
**Data layer:** Prisma 7 · PostgreSQL 16
**Related:** [`schema.md`](./schema.md) · [`../architecture/deployment.md`](../architecture/deployment.md) · [`../../docs/deployment.md`](../../docs/deployment.md)

---

## 1. The policy

| Rule | Detail |
|---|---|
| **Migrations are reviewed** | A migration is a pull request with the SQL in the description. The reviewer reads the SQL, not just the schema diff. |
| **Migrations run in a release step** | Never on application boot. A separate one-off container runs `prisma migrate deploy` before the new version serves traffic. |
| **Migrations are forward-only in production** | `prisma migrate dev` is a development command. Production runs `prisma migrate deploy`. |
| **Every migration is reversible or explicitly irreversible** | The pull request states the rollback. An irreversible migration requires the explicit approval of the product owner and a verified backup. |
| **One concern per migration** | A schema change and a data backfill are separate migrations. |
| **No migration touches production data destructively without a backup** | The pre-migration backup is mandatory and must be verified. |
| **A migration is idempotent where it can be** | A backfill uses `WHERE` guards so a re-run is safe. |

## 2. The workflow

```
1. Write the schema change in apps/api/prisma/schema.prisma
2. pnpm --filter @chlat/api prisma migrate dev --name <name>   (development only)
3. Review the generated SQL in apps/api/prisma/migrations/<ts>_<name>/migration.sql
4. PR: the schema change + the migration + the rollback note in the description
5. CI: prisma validate + prisma migrate diff (no drift) + a migration against a fresh test database
6. Staging: deploy → run the migration → smoke test
7. Production: backup → run the migration → deploy → smoke test
```

### 2.1 The CI checks

| Check | Command | Fails when |
|---|---|---|
| The schema is valid | `prisma validate` | The schema does not parse |
| No drift | `prisma migrate diff --from-migrations --to-schema-datamodel` | The schema and the migrations disagree |
| The migration applies | `prisma migrate deploy` against an empty database | The migration fails |
| The migration is reversible | A review checklist item | The rollback is missing |
| The generated client is up to date | `prisma generate` produces no diff | The committed client is stale |

## 3. The release step

Migrations are applied by a **one-off container** in the Coolify release, not by the application:

```yaml
# The release pipeline
- name: Backup
  run: ./scripts/backup.sh pre-migration

- name: Migrate
  run: pnpm --filter @chlat/api prisma migrate deploy
  # runs in a one-off container with the production DATABASE_URL

- name: Deploy
  run: coolify deploy

- name: Health gate
  run: ./scripts/wait-for-health.sh https://api.<domain>/api/v1/health/ready
```

**Why not on boot:** a bad migration inside the application entrypoint turns a controlled release
into a crash loop across every replica, and the rollback becomes an emergency rather than a step.

## 4. The migration categories

### 4.1 Additive (the default)

A new column with a nullable value, a new table, a new index.

* **Backward compatible:** the previous application version keeps working.
* **Rollback:** drop the column / the table / the index. The data is lost, but the application does
  not depend on it.
* **Safe to deploy in the same release as the code that uses it**, as long as the code tolerates
  the old value (which it does, because the column is nullable).

### 4.2 Backfill

Populating a new column from an existing one.

```sql
-- Backfill in bounded batches, idempotent
UPDATE parking_sessions
SET plate_digest = compute_digest(plate_id_normalized)
WHERE plate_digest IS NULL
  AND id IN (
    SELECT id FROM parking_sessions
    WHERE plate_digest IS NULL
    LIMIT 5000
  );
```

* Run it in a **separate migration** from the schema change.
* Run it in **batches** so the transaction does not lock the table for long.
* Make it **idempotent** (`WHERE plate_digest IS NULL`) so a re-run is safe.
* Run it **outside a transaction** when the batch size is large, and record the progress.

### 4.3 Constraining

Adding a `NOT NULL`, a `UNIQUE`, or a `CHECK` to an existing table.

* **Four-step rollout** to avoid a long lock:
  1. Add the constraint as `NOT VALID` (PostgreSQL) or a validating-but-not-enforced index.
  2. Backfill the violating rows.
  3. Validate the constraint.
  4. Make it enforced.
* **Rollback:** drop the constraint. The data is untouched.

### 4.4 Destructive — the dangerous one

Dropping a column, narrowing a type, or changing a foreign key's behaviour.

* Requires: a written rollback plan, a **verified** pre-migration backup, and an explicit approval.
* Requires a **two-release deprecation window**:
  1. Release *N*: stop writing the column; keep reading it.
  2. Release *N+1*: stop reading it.
  3. Release *N+2*: drop it.
* The rollback is "restore the backup", which loses everything since the backup. This is why it is
  slow, and why it is rare.

## 5. The rollback procedure

| Situation | Action | Data impact |
|---|---|---|
| The migration failed and rolled back | Nothing to do — PostgreSQL rolled the transaction back | None |
| The migration applied and the code is fine | Nothing to do | None |
| The migration applied and the new code is broken | Roll the application back to the previous image; the additive migration stays | None |
| The migration applied additively and the old code breaks | Roll the code back; if the old code cannot tolerate the new column, restore the backup | Depends |
| A destructive migration broke something | Restore the pre-migration backup | Everything since the backup is lost |

**The backup is only useful if it is verified.** See `docs/database-backup-restore.md` for the
restore drill.

## 6. The nightly consistency checks

These run as a scheduled job (a Coolify cron or a systemd timer) and page on a finding. They do
**not** repair the data automatically — a repair is a migration, reviewed like any other.

### 6.1 The `payments.site_id` invariant

```sql
-- payments.site_id must equal parking_sessions.site_id
SELECT p.id, p.site_id AS payment_site, s.site_id AS session_site
FROM payments p
JOIN parking_sessions s ON s.id = p.session_id
WHERE p.site_id IS DISTINCT FROM s.site_id;
-- must return zero rows
```

**Why it matters:** the revenue report groups by `payments.site_id` for performance. A mismatch
would attribute a payment to the wrong site — and therefore to the wrong owner.

**On a finding:** page, then fix with a reviewed migration. Do not patch the rows in place.

### 6.2 The fee snapshot invariant

```sql
-- a COMPLETED session must have a fee snapshot
SELECT id, site_id, status
FROM parking_sessions
WHERE status IN ('COMPLETED', 'EXIT_PENDING')
  AND (fee_amount_minor IS NULL OR fee_currency IS NULL)
  AND exit_at IS NOT NULL;
-- must return zero rows
```

### 6.3 The session state invariant

```sql
-- a session with entry_at must not be PENDING_CLAIM, and vice versa
SELECT id, status, entry_at
FROM parking_sessions
WHERE (status = 'PENDING_CLAIM' AND entry_at IS NOT NULL)
   OR (status NOT IN ('PENDING_CLAIM') AND entry_at IS NULL);
-- must return zero rows
```

### 6.4 The ticket invariant

```sql
-- a session with a ticket must be ACTIVE or later; a ticketless ACTIVE session is a broken claim
SELECT s.id, s.status, t.id AS ticket_id
FROM parking_sessions s
LEFT JOIN tickets t ON t.session_id = s.id
WHERE s.status IN ('ACTIVE', 'EXIT_PENDING', 'COMPLETED')
  AND t.id IS NULL;
-- must return zero rows
```

### 6.5 The claim invariant

```sql
-- a claimed claim must have a ticket
SELECT c.id, c.session_id
FROM entry_claims c
WHERE c.claimed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.session_id = c.session_id);
-- must return zero rows
```

### 6.6 The plate-digest invariant

```sql
-- a session with a readable plate must have a digest
SELECT COUNT(*) FROM parking_sessions
WHERE plate_id_normalized IS NOT NULL AND plate_digest IS NULL;
-- must be zero, except for rows redacted by the retention job
```

### 6.7 The runbook for a finding

```
1. The check reports a violation → page the on-call engineer.
2. Identify the scope: how many rows, which site, when did it start.
3. Check the backup: is the last backup clean for this table?
4. Decide: a data repair (a reviewed migration) or a code fix (the check found a bug).
5. Fix, re-run the check, confirm it is clean.
6. Write the incident note in docs/incident-response.md.
```

**Never** run an ad-hoc `UPDATE` against production to silence a check. The check exists to be
listened to.

## 7. The data-retention jobs

| Job | Schedule | What it does |
|---|---|---|
| The plate redaction | Daily | `plate_id_normalized = NULL` for sessions closed more than 90 days ago. `plate_digest` is retained. |
| The ticket and claim cleanup | Daily | Delete `entry_claims` and `tickets` for sessions closed more than 90 days ago. The session, the payment, and the audit rows are retained. |
| The refresh-token cleanup | Daily | Delete `refresh_tokens` expired more than 30 days ago. |
| The audit retention | Monthly | Delete `audit_logs` older than 24 months, in bounded batches. |
| The consistency checks | Nightly | The six checks in §6. |

All the jobs are **idempotent**, run in **bounded batches**, and log a summary of what they
changed.

## 8. Environments and the migration lifecycle

| Environment | Migration command | Data | Rollback |
|---|---|---|---|
| Local | `prisma migrate dev` | Seeded | `prisma migrate reset` |
| CI | `prisma migrate deploy` on an empty database | Empty | Drop and recreate |
| Staging | `prisma migrate deploy` | Resettable | `prisma migrate reset` |
| Production | `prisma migrate deploy` | Real | Roll the code back; restore the backup for a destructive change |

**A migration is rehearsed in staging before it reaches production.** The staging database is
restored from a production backup before the rehearsal, so the migration runs against
production-shaped data.

## 9. The backup before the migration

```bash
#!/usr/bin/env bash
# scripts/backup.sh — the pre-migration backup
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="s3://${BACKUP_BUCKET}/${SITE}/pre-migration-${STAMP}.dump"

pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
  | gzip -9 \
  | aws s3 cp - "$TARGET" \
  --sse AES256 --metadata "backup-type=pre-migration"

# Verify the backup is readable before declaring success
aws s3 cp "$TARGET" /tmp/verify.dump --quiet
pg_restore --list /tmp/verify.dump > /dev/null
rm -f /tmp/verify.dump

echo "Pre-migration backup verified: ${TARGET}"
```

**A backup that has not been verified is not a backup.** The verification step is what makes the
restore in `docs/database-backup-restore.md` possible.

## 10. Related

* `specs/data/schema.md` — the model of record and the invariants.
* `specs/architecture/deployment.md` — the release sequence.
* `docs/database-backup-restore.md` — the backup and the restore drill.
* `docs/incident-response.md` — "the revenue looks wrong".
