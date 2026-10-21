# Chlat-Park — Deployment Architecture

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`container-architecture.md`](./container-architecture.md) · [`../data/migrations.md`](../data/migrations.md) · [`../../docs/deployment.md`](../../docs/deployment.md) · [`../../docs/database-backup-restore.md`](../../docs/database-backup-restore.md)

> This document is the **architecture** view of deployment. The step-by-step operator procedure
> lives in [`../../docs/deployment.md`](../../docs/deployment.md).

---

## 1. Environments

| Environment | Purpose | Database | Data | Secrets source |
|---|---|---|---|---|
| **Local** | Developer machines, `docker compose up` | Local PostgreSQL container | Synthetic / seeded | `.env.local`, never committed |
| **Staging** | Integration, e2e, smoke tests, migration rehearsal | Separate PostgreSQL instance | Seeded, resettable | Coolify staging env vars |
| **Production** | The pilot and, later, real sites | Production PostgreSQL instance | Real | Coolify production env vars |

**Hard rules**

* The three environments never share a database, a database user, or a secret.
* Production data is never copied into staging or local.
* Staging is wiped and re-seeded on demand; production is backed up, never reset.

## 2. Coolify topology (pilot)

```
                        ┌──────────────── Internet ────────────────┐
                        │  acme challenge / DNS / SSH            │
                        └───────────────────┬──────────────────────┘
                                            │
                        ┌───────────────────▼──────────────────────┐
                        │  Coolify project: "chlat-park"          │
                        │  ─────────────────────────────────────  │
                        │  Proxy (Traefik)  →  TLS, HTTP redirect  │
                        │  ┌────────────────────────────────────┐  │
                        │  │ Service: web   (apps/web)         │  │
                        │  │ Service: api   (apps/api)         │  │
                        │  │ Service: db    (postgres:16)      │  │
                        │  │ Volume: pgdata (encrypted disk)   │  │
                        │  │ Cron:    db-backup (pg_dump)      │  │
                        │  └────────────────────────────────────┘  │
                        └──────────────────────────────────────────┘
```

| Host requirement | Pilot | Later |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 24.04 LTS | same |
| Backup destination | Encrypted object storage bucket, separate account | same, plus a second region |

A single VPS is acceptable for a pilot of one to a handful of sites, and it is a **single point of
failure**. The mitigation path is the local parking service (deferred) plus tested restores.

## 3. Container build

| Image | Base | Build | Runs as | Exposed port |
|---|---|---|---|---|
| `apps/web` | `node:22-alpine` | `pnpm --filter @chlat/web build` → `next build` with `output: 'standalone'` | non-root `node` uid 1000 | 3000 |
| `apps/api` | `node:22-alpine` | `pnpm --filter @chlat/api build` → `nest build` | non-root `node` uid 1000 | 3001 |
| `postgres` | `postgres:16-alpine` | official | `postgres` | internal only |

Both application images are multi-stage: the runtime image contains only production dependencies
and build output. No dev dependencies, no source maps in production (or source maps uploaded to the
error tracker instead), no test fixtures.

**Image pinning:** base images are pinned by digest, not by floating tag. Renovate/Dependabot
proposes digest bumps; they are merged deliberately, never automatically.

## 4. Environment variables

All configuration is supplied by the environment. **No secret is ever baked into an image or
committed to Git.** Coolify's environment-variable store is the source of truth for staging and
production.

### 4.1 API

| Variable | Required | Example | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | `production` | |
| `PORT` | yes | `3001` | |
| `DATABASE_URL` | yes | `postgresql://app:***@db:5432/chlat_park?schema=public` | Coolify secret |
| `JWT_ACCESS_SECRET` | yes | 32+ random bytes, base64 | Coolify secret, rotated via a documented procedure |
| `JWT_REFRESH_SECRET` | yes | distinct value | Coolify secret |
| `JWT_ACCESS_TTL` | yes | `15m` | |
| `JWT_REFRESH_TTL` | yes | `7d` | |
| `COOKIE_DOMAIN` | yes | `chlat-park.com` | |
| `COOKIE_SECURE` | yes | `true` | `false` only for local http |
| `PLATE_PEPPER` | yes | 32+ random bytes | HMAC pepper for `plate_digest`; see ADR-010 |
| `TELEGRAM_BOT_TOKEN` | P1 | `123456:ABC...` | Coolify secret, P1 only |
| `TELEGRAM_WEBHOOK_SECRET` | P1 | random | Validates inbound webhooks |
| `RATE_LIMIT_*` | no | defaults | Per-bucket overrides |
| `LOG_LEVEL` | no | `info` | `info` in production |
| `SENTRY_DSN` | no | — | Optional error reporting; tickets/claims are scrubbed |
| `TRUSTED_PROXY` | yes | `1` | For correct client IPs behind the proxy |

### 4.2 Web

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Public base URL of the API (`https://api.<domain>`) |
| `API_INTERNAL_URL` | yes | Internal URL used for server-side calls (`http://api:3001`) |
| `NEXT_PUBLIC_SITE_URL` | yes | Used for canonical URLs and share links |
| `NEXT_PUBLIC_TELEGRAM_BOT` | P1 | Bot username for deep links |

**Rule:** `NEXT_PUBLIC_*` variables are public by definition. No secret, token, key, pepper, or
internal URL may ever use that prefix. A CI check rejects `NEXT_PUBLIC_*` variables whose names
suggest a secret.

## 5. Deployment sequence

```
1. Build & push images (immutable tags: <app>-<git-sha>)
2. Backup: pre-migration pg_dump → offsite (always)
3. Apply migrations in a controlled release step (one-off container, not on app boot)
4. Restart / roll out the api and web services
5. Health gates: /health/ready on api must be green
6. Smoke test: claim a test session, complete a test exit, check the audit trail
7. Monitor: error rate, latency, and the "sessions created vs tickets issued" funnel
```

**Migrations run before the new application version serves traffic** and are **not** run by the
application's entrypoint. This keeps a bad migration from turning into a crash loop and keeps
rollback a deliberate act.

**Rollback**

| Situation | Action | Data impact |
|---|---|---|
| Bad application release, no schema change | Roll the image tag back to the previous SHA | None |
| Bad application release, additive schema change | Roll the image back; leave the additive column in place (backwards compatible) | None |
| Bad **destructive** migration | Restore the pre-migration backup and re-apply | Sessions between the backup and the restore are lost — this is why destructive migrations require an explicit approval and a tested restore |

Destructive migrations are only merged with (a) a written rollback plan, (b) a verified backup, and
(c) a two-release deprecation window (stop writing → migrate → stop reading the old shape).

## 6. Health, probes, and observability

| Endpoint | Semantics | Used by |
|---|---|---|
| `GET /health/live` | The process is up. No dependency checks. | Container liveness probe |
| `GET /health/ready` | The database is reachable, migrations are at the expected version, and the process can serve traffic. | Container readiness probe / traffic gate |

**Signals to monitor**

| Signal | Alert threshold | Why |
|---|---|---|
| API 5xx rate | > 1 % over 5 min | Site impact |
| API p95 latency (dashboard endpoints) | > 500 ms over 15 min | NFR breach |
| `/health/ready` failures | 2 consecutive minutes | Site impact |
| Backup job failure | any | Data-loss risk |
| Postgres disk usage | > 80 % | Write failures |
| Claim rate collapse | < 50 % of the 7-day median | Owners are not claiming — likely a broken monitor QR |
| Audit write failures | any | Integrity gap |
| Offline sync backlog | *n/a* | Deferred |

**Logging rules**

* Structured JSON to stdout; the platform collects it.
* Every line carries `requestId`, `actorId` (when authenticated), `siteId` (when in scope), and a
  `route` label.
* **Redacted fields:** `claimToken`, `ticketToken`, `password`, `passwordHash`, `authorization`,
  `cookie`, `set-cookie`, `telegramBotToken`, `platePepper`, and any `*_hash` column.
* Raw plate IDs are **not** written to application logs. The `plate_digest` may be logged.
* Error reporting (Sentry) scrubs the same field list.

## 7. Backup and restore

| Item | Policy |
|---|---|
| Backup type | `pg_dump` (custom format) + WAL archiving for point-in-time recovery |
| Schedule | Nightly full at 02:00 site-local time, retained 14 days; 1 full copy offsite daily |
| Encryption | Encrypted at rest with a key stored separately from the data |
| Destination | Object storage in a **different account/region** from the VPS |
| Verification | Weekly automated restore into a scratch container, verifying row counts and a checksum of a sample |
| Manual drill | Monthly, documented in `docs/database-backup-restore.md` |
| RPO / RTO | RPO ≤ 24 h, RTO ≤ 4 h for a full restore |

## 8. Release management

| Stage | Gate |
|---|---|
| Pull request | Lint, typecheck, unit tests, contract drift check, route-audit test, migration lint |
| Merge to main | All of the above green + an approval |
| Deploy to staging | Automatic; smoke test runs |
| Deploy to production | Manual approval; pre-migration backup; migrations; health gate; smoke test |

**Rollback is always preferred over a hotfix** during the pilot. A hotfix is acceptable only when
the defect blocks a site from operating and the previous release is known-good.

## 9. Capacity expectations for the pilot

| Metric | Expected |
|---|---|
| Sites | 1–5 |
| Sessions per site per day | 100–400 |
| Peak concurrent guards | < 10 |
| Peak API rps | < 20 (bursts at shift change) |
| API memory | < 512 MB |
| DB size after 1 year (5 sites) | < 2 GB |

These numbers inform the Postgres sizing; they are re-checked at the end of Phase 7 (pilot).
