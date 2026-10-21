# Chlat-Park — Deployment Runbook

> **This is an operational runbook, not a specification.** It describes how to run Chlat-Park. Where
> it disagrees with `specs/` about product behaviour, the spec wins and this document is a bug.
> The architecture view is in `specs/architecture/deployment.md`.

**Last updated:** 2026-10-21
**Audience:** the operator deploying or releasing Chlat-Park.

---

## 1. What gets deployed

| Service | Source | Image | Port | Notes |
|---|---|---|---|---|
| `web` | `apps/web` | `ghcr.io/<org>/chlat-web:<git-sha>` | 3000 | Next.js, standalone output |
| `api` | `apps/api` | `ghcr.io/<org>/chlat-api:<git-sha>` | 3001 | NestJS |
| `db` | — | `postgres:18-alpine` | 5432 (internal), 5433 (host) | The persistent volume |

The Telegram bot is **not** a separate service — it is a module inside `api` (ADR-001).

## 2. The one-time setup

### 2.1 The Coolify project

1. Create a project `chlat-park` and an environment `production`.
2. Create the resources:
   * a **PostgreSQL 16** database, with the volume on an encrypted disk,
   * two **applications** (`web`, `api`),
   * a **proxy** (Coolify's Traefik) in front of both.
3. Attach a domain (e.g. `chlat-park.com`) with `www` → `web` and `api` → `api`.
4. Enable the Let's Encrypt certificate in the proxy.
5. Create a separate environment `staging` with its own domain, its own database, and its own
   secrets. **Never share a database or a secret between the environments.**

### 2.2 The environment variables

Set these in Coolify under the environment's environment-variables tab. **Mark every secret as
encrypted.**

#### `api`

| Variable | Example | Secret |
|---|---|---|
| `NODE_ENV` | `production` | no |
| `PORT` | `3001` | no |
| `DATABASE_URL` | `postgresql://chlat:<password>@chlat-db:5432/chlat_park?schema=public` | **yes** |
| `JWT_ACCESS_SECRET` | 32+ random bytes, base64 | **yes** |
| `JWT_REFRESH_SECRET` | a *different* 32+ bytes | **yes** |
| `JWT_ACCESS_TTL` | `15m` | no |
| `JWT_REFRESH_TTL` | `7d` | no |
| `COOKIE_DOMAIN` | `chlat-park.com` | no |
| `COOKIE_SECURE` | `true` | no |
| `PLATE_PEPPER` | 32+ random bytes, base64 | **yes** |
| `TRUSTED_PROXY` | `1` | no |
| `LOG_LEVEL` | `info` | no |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC…` (P1 only) | **yes** |
| `TELEGRAM_WEBHOOK_SECRET` | random (P1 only) | **yes** |
| `SENTRY_DSN` | optional | **yes** |

Generate the secrets with:

```bash
openssl rand -base64 48   # for the JWT secrets
openssl rand -base64 32   # for the pepper
```

#### `web`

| Variable | Example | Secret |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.chlat-park.com/api/v1` | no |
| `API_INTERNAL_URL` | `http://api:3001` | no |
| `NEXT_PUBLIC_SITE_URL` | `https://chlat-park.com` | no |
| `NEXT_PUBLIC_TELEGRAM_BOT` | `chlatpark_bot` (P1 only) | no |

> **`NEXT_PUBLIC_*` variables are public.** Anything with that prefix ends up in the browser
> bundle. Never put a secret in one. The CI check rejects a `NEXT_PUBLIC_*` name that looks like a
> secret.

### 2.3 The first deployment

```bash
# 1. Apply the migrations (the one-off container, not the app)
DATABASE_URL='postgresql://…' pnpm --filter @chlat/api prisma migrate deploy

# 2. Seed the catalogue, the roles, and the first super admin
DATABASE_URL='postgresql://…' pnpm --filter @chlat/api prisma db seed
#    The seed prints the super admin's email and a one-time setup link.

# 3. Deploy the api and the web through Coolify (or):
DATABASE_URL='…' pnpm --filter @chlat/api build && pnpm --filter @chlat/api start:prod
```

> **The Prisma client is generated, not committed.** The schema uses the `prisma-client` generator with a
> fixed output path (`apps/api/src/generated/prisma`), so the client is compiled into `dist/generated/prisma`
> alongside the rest of the API. A build that skips `prisma generate` produces an API that boots and then
> fails on the first query. The Dockerfiles run `pnpm --filter @chlat/api run db:generate` before compiling,
> and a local build must do the same:
>
> ```bash
> pnpm --filter @chlat/api run db:generate && pnpm --filter @chlat/api run build
> ```
>
> The generator is platform-specific, so it must run *inside* the image, not on the host, when the target
> platform differs from the build machine.

### 2.4 The seed

The seed script is **idempotent** — it can be run on every release. It inserts:

* the permission catalogue (one row per key from `@chlat/contracts`);
* the role grants for `super_admin`, `owner`, `guard`, and `user`;
* the default settings for any site created by the seed.

The **first super admin is created by hand** (not by the seed), so that the credential is not in a
script's output. Use the platform's admin tooling or a one-off command:

```bash
pnpm --filter @chlat/api admin:create-super-admin --email you@example.com
```

## 3. The release procedure

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Merge to main  →  CI: lint, typecheck, test, contract drift,  │
│                      route audit, secret scan, dependency audit  │
├──────────────────────────────────────────────────────────────────┤
│ 2. Build the images  →  tag with the git SHA                     │
├──────────────────────────────────────────────────────────────────┤
│ 3. Deploy to staging  →  migrate  →  smoke test                 │
├──────────────────────────────────────────────────────────────────┤
│ 4. Backup (pre-migration)  →  migrate  →  deploy  →  health     │
│    gate  →  smoke test  →  monitor                               │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 The exact steps

```bash
# 0. Pre-flight
git log -1 --format=%H              # note the SHA
curl -fsS https://api.chlat-park.com/api/v1/health/ready | jq .

# 1. Back up (mandatory before a migration)
./scripts/backup.sh pre-migration

# 2. Apply the migrations in a one-off container
DATABASE_URL='…' pnpm --filter @chlat/api prisma migrate deploy

# 3. Deploy (Coolify: redeploy the api and the web with the new image tag)

# 4. Health gate
./scripts/wait-for-health.sh https://api.chlat-park.com/api/v1/health/ready

# 5. Smoke test
./scripts/smoke-test.sh https://api.chlat-park.com
```

### 3.2 The smoke test

`scripts/smoke-test.sh` runs a full end-to-end flow against the deployed environment with a
dedicated test site:

1. Create a session at the test site with a test plate.
2. Claim the entry QR.
3. Verify the ticket at the exit.
4. Record a test payment.
5. Complete the exit.
6. Assert the audit trail contains the expected rows.

It uses a dedicated `SMOKE_TEST_SITE_ID` and a `SMOKE_TEST` prefix on the plate, so the test rows
are identifiable and can be cleaned up by the retention job.

**The smoke test must pass before the release is considered complete.** A release that is "probably
fine" is a release that has not been released.

## 4. The rollback

| Situation | Action | Data impact |
|---|---|---|
| The new version fails the health gate | Redeploy the previous image tag | None |
| The new version boots but the smoke test fails | Redeploy the previous image tag | None |
| The migration is additive and the new code is broken | Redeploy the previous image tag; leave the added column | None |
| The migration is additive and the **old** code cannot tolerate it | Restore the pre-migration backup | Everything since the backup is lost |
| A destructive migration broke something | Restore the pre-migration backup | Everything since the backup is lost |

**Rolling back the image is always the first option.** A hotfix is acceptable only when the defect
blocks a site from operating and the previous release is known-good.

```bash
# Roll back the image
docker tag ghcr.io/<org>/chlat-api:<previous-sha> ghcr.io/<org>/chlat-api:latest
# then redeploy through Coolify

# Or, restoring the database (last resort)
./scripts/restore.sh <backup-file>
```

**A destructive migration requires a written rollback plan, a verified backup, and a two-release
deprecation window** — see `specs/data/migrations.md` §4.4.

## 5. Monitoring

| Signal | Where | Alert when |
|---|---|---|
| `/health/ready` | The platform | 2 consecutive failures |
| The API 5xx rate | The platform metrics | > 1 % over 5 minutes |
| The API p95 latency (the dashboard endpoints) | The platform metrics | > 500 ms over 15 minutes |
| The database disk usage | The platform | > 80 % |
| The backup job | The cron log | Any failure |
| The nightly consistency checks | The cron log | Any finding |
| The claim rate per site | The admin console | < 50 % of the 7-day median — a broken monitor QR |
| The audit write failures | The platform metrics | Any |

## 6. The scheduled jobs

| Job | Schedule | Command |
|---|---|---|
| The database backup | Daily at 02:00 site-local | `./scripts/backup.sh scheduled` |
| The backup verification | Weekly, Sunday | `./scripts/backup-verify.sh` |
| The plate redaction | Daily at 03:00 | `pnpm --filter @chlat/api job:redact-plates` |
| The ticket and claim cleanup | Daily at 03:15 | `pnpm --filter @chlat/api job:cleanup-tickets` |
| The refresh-token cleanup | Daily at 03:30 | `pnpm --filter @chlat/api job:cleanup-tokens` |
| The consistency checks | Nightly at 04:00 | `pnpm --filter @chlat/api job:check-consistency` |
| The audit retention | Monthly, the 1st at 04:00 | `pnpm --filter @chlat/api job:retention` |

Configure them as Coolify cron jobs, each with its own log. **A job that fails silently is worse
than no job**, so every job's exit code is checked and a failure raises an alert.

## 7. The logs

```bash
# The platform's log view
coolify logs --service api --tail 200 --since 1h

# The structured log fields
{
  "timestamp": "2026-10-21T09:12:44.120Z",
  "level": "info",
  "requestId": "01JB9Z0K7Y8X4Q2M3N5P6R7S8T",
  "actorId": "…",
  "siteId": "…",
  "route": "POST /api/v1/entry-claims/claim",
  "durationMs": 42,
  "message": "Entry claim rejected"
}
```

**Never log:** a raw claim token, a raw ticket token, a password, a cookie, an authorization
header, the bot token, the plate pepper, or a readable plate. The redaction interceptor enforces
this. If you see one in a log, that is a bug — report it.

## 8. The common operations

### 8.1 Create a parking owner

```bash
pnpm --filter @chlat/api admin:create-owner --name "Sokha Parking" --email owner@example.com
```

The owner receives a set-password link by whatever channel the operator uses. The operator never
sets the owner's password.

### 8.2 Create a site for an owner

```bash
pnpm --filter @chlat/api admin:create-site \
  --owner <ownerId> \
  --name "Riverside Parking" \
  --timezone "Asia/Phnom_Penh" \
  --currency USD
```

### 8.3 Add a guard to a site

The owner does this from the owner console. To do it from the command line:

```bash
pnpm --filter @chlat/api admin:invite-guard \
  --site <siteId> --email guard@example.com --name "Vichea" --role guard
```

### 8.4 Reset a super admin's password

```bash
pnpm --filter @chlat/api admin:reset-password --email admin@example.com
```

The new password is set as `pending` and must be changed at the first sign-in. The reset is
audited.

### 8.5 Suspend a user

```bash
pnpm --filter @chlat/api admin:suspend-user --email someone@example.com --reason "left the company"
```

Their access is blocked immediately and their refresh tokens are revoked.

### 8.6 Rotate the JWT access secret

```bash
# 1. Set the new secret in Coolify and redeploy.
# 2. Wait for the access TTL (15 minutes) so every old access token expires.
# 3. Rotate the refresh secret and redeploy — every user must sign in again.
```

To avoid a hard cutover, a dual-secret verification window (accepting the old and the new access
secret for 15 minutes) can be used. See `specs/features/security/` §5.

### 8.7 Rotate the plate pepper

> **This breaks the historical distinct-guest counts** (ADR-010). Do it only on a suspected
> compromise, and record the rotation date.

```bash
# 1. Set the new PLATE_PEPPER and redeploy.
# 2. Optionally recompute the digests for the retained rows:
pnpm --filter @chlat/api job:recompute-digests --from 2026-01-01
# 3. Record the rotation so the console can flag the continuity break.
```

## 9. The runbooks index

| Situation | Runbook |
|---|---|
| Deploying or releasing | This document |
| Restoring the database | `docs/database-backup-restore.md` |
| Training a guard | `docs/guard-training.md` |
| A site is down / a ticket is disputed / the revenue looks wrong | `docs/incident-response.md` |
