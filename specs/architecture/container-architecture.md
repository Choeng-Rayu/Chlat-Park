# Chlat-Park — Container Architecture (C4 Level 2)

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`system-context.md`](./system-context.md) · [`deployment.md`](./deployment.md) · [`rbac-design.md`](./rbac-design.md)

---

## 1. Purpose

Describes the internal structure of the Chlat-Park system: the deployable containers, the NestJS
module layout, the shared packages, and the request lifecycle through the code.

## 2. Container diagram

```
┌─────────────────────────────── VPS (Coolify) ────────────────────────────────┐
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Reverse proxy (Coolify Traefik) — TLS termination, HTTP→HTTPS redirect │  │
│  │  • www.<domain>       → apps/web                                       │  │
│  │  • api.<domain>       → apps/api                                       │  │
│  │  • <domain>/telegram/* → apps/api (webhook)                            │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────┐        ┌──────────────────────────────────┐  │
│  │  apps/web — Next.js         │        │  apps/api — NestJS                │  │
│  │  ─────────────────────────  │  HTTP  │  ──────────────────────────────  │  │
│  │  /            owner + guest │───────▶│  /api/v1/*  REST (OpenAPI 3.1)  │  │
│  │  /guard/      guard dash    │  SSR   │  /telegram/webhook              │  │
│  │  /owner/      owner console │        │  /health/live  /health/ready    │  │
│  │  ─────────────────────────  │        │  ──────────────────────────────  │  │
│  │  No secrets. No signing keys│        │  Modules:                        │  │
│  │  No business rules.         │        │   AuthModule  UsersModule        │  │
│  │  Server components fetch    │        │   OwnersModule ParkingSitesModule│ │
│  │  the API directly.          │        │   SecurityGuardsModule           │  │
│  └────────────────────────────┘        │   PricingModule                  │  │
│                                        │   ParkingSessionsModule          │  │
│                                        │   EntryClaimsModule              │  │
│                                        │   TicketsModule                  │  │
│                                        │   VerificationModule             │  │
│                                        │   PaymentsModule                 │  │
│                                        │   AuditModule                    │  │
│                                        │   TelegramModule                 │  │
│                                        │   ReportsModule (owner + admin)  │  │
│                                        │   AuthorizationModule (RBAC)     │  │
│                                        │   HealthModule                   │  │
│                                        │  ──────────────────────────────  │  │
│                                        │  Prisma 7 (client + migrations)  │  │
│                                        └───────────────┬──────────────────┘  │
│                                                        │ SQL (private)       │
│                                        ┌───────────────▼──────────────────┐  │
│                                        │  PostgreSQL 16 (private network) │  │
│                                        │  + pg_dump → encrypted offsite   │  │
│                                        └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

> `SyncModule` and the local parking service container are **deferred** (ADR-003,
> `offline-architecture.md`). The module boundary is reserved in the code so the domain model does
> not have to be rewritten later.

## 3. Deployable units

| Unit | Type | Port | Replicas (pilot) | Notes |
|---|---|---|---|---|
| `apps/web` | Next.js (standalone output) | 3000 | 1 | Stateless. Serves all three route groups. |
| `apps/api` | NestJS (node) | 3001 | 1 | Stateless except for no local state; the database is the only state. |
| `postgres` | PostgreSQL 16 | 5432 (internal only) | 1 | Not exposed publicly. Backed up nightly. |
| `telegram-bot` | *not a container* | — | — | A NestJS module inside `apps/api` (ADR-001). |

## 4. `apps/api` module layout

```
apps/api/src/
├── main.ts                    # bootstrap, helmet, cookie-parser, request-id, graceful shutdown
├── app.module.ts
├── common/
│   ├── guards/                # PermissionGuard (global), JwtAuthGuard, RateLimitGuard
│   ├── decorators/            # @RequirePermissions(), @Public(), @CurrentUser(), @IdempotencyKey()
│   ├── filters/               # AllExceptionsFilter -> consistent error envelope + request id
│   ├── interceptors/          # RequestIdInterceptor, AuditInterceptor
│   └── dto/                   # pagination, error envelope, shared DTO shapes
├── modules/
│   ├── auth/                  # login, logout, refresh, password hashing (Argon2id)
│   ├── users/
│   ├── owners/
│   ├── parking-sites/
│   ├── security-guards/       # NOTE: named `security-guards`, NOT `guards` (L1)
│   ├── pricing/
│   ├── parking-sessions/      # session lifecycle + state machine
│   ├── entry-claims/          # entry QR token lifecycle
│   ├── tickets/               # e-ticket issuance, safe public payload
│   ├── verification/          # exit verification
│   ├── payments/              # payment states, manual cash recording, exemptions
│   ├── audit/                 # audit writer + readers + export
│   ├── authorization/         # AuthorizationService, ScopeResolver, permission catalogue
│   ├── telegram/              # webhook, deep links, delivery
│   ├── reports/               # owner reports + admin revenue/adoption analytics
│   ├── health/
│   └── sync/                  # DEFERRED placeholder module
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── contracts/                 # re-export of @chlat/contracts schemas for DTOs
```

**Naming constraint (L1):** the security-guard feature module is `security-guards` and the Prisma
model is `SecurityGuard`. `src/common/guards/` holds framework guards. The two must never share a
name, an import path, or a route prefix.

## 5. Shared packages

| Package | Contents | Consumers |
|---|---|---|
| `@chlat/contracts` | Zod schemas, TypeScript types, the permission catalogue, the OpenAPI generator | `apps/api` (validation), `apps/web` (types + client) |
| `@chlat/api-client` | Generated typed HTTP client from the OpenAPI document | `apps/web`, `apps/api` tests |
| `@chlat/config` | Shared TypeScript, ESLint, Prettier configuration | everything |
| `@chlat/ui` | Shared React components (buttons, tables, QR renderer, status badges) | `apps/web` |

**Rule:** business rules live in `apps/api` only. `packages/contracts` may hold *schemas* and the
*permission catalogue*, but never a rule such as "a session can only complete once" in executable
form. Shared validation schemas are fine; shared decision logic is not.

## 6. Request lifecycle (guard exit completion — the most sensitive path)

```
Browser                     apps/web                apps/api                PostgreSQL
  │  POST /api/v1/parking-sessions/:id/exit/complete
  │ ────────────────────────────▶
  │                             │  server-side fetch (cookie forwarded)
  │                             │ ─────────────────────────────▶
  │                             │                              │ 1. RequestIdInterceptor
  │                             │                              │ 2. JwtAuthGuard: verify JWT, load user
  │                             │                              │ 3. PermissionGuard: @RequirePermissions('site.exit.complete')
  │                             │                              │ 4. AuthorizationService: resolve fine-grained grants
  │                             │                              │ 5. ScopeResolver: session.siteId ∈ actor scope
  │                             │                              │ 6. DTO validation (Zod)
  │                             │                              │ 7. Idempotency-Key check
  │                             │                              │ 8. BEGIN TX
  │                             │                              │    SELECT session FOR UPDATE
  │                             │                              │    re-check: status==ACTIVE|EXIT_PENDING
  │                             │                              │    re-check: payment satisfied (PAID|EXEMPT)
  │                             │                              │    re-check: ticket ISSUED and not spent
  │                             │                              │    UPDATE session -> EXIT_PENDING -> COMPLETED
  │                             │                              │    UPDATE ticket -> (spent)
  │                             │                              │    UPDATE payment (if any) -> PAID, captured_at=now
  │                             │                              │    INSERT fee snapshot (fee_amount_minor, fee_currency)
  │                             │                              │    INSERT audit_log
  │                             │                              │ 9. COMMIT
  │                             │ ◀─────────────────────────────│
  │ ◀──────────────────────────│ 200 { session, fee, receipt }
```

Failure at any step produces a **consistent error envelope** and a **rolled-back transaction**:

```json
{
  "error": {
    "code": "EXIT_SESSION_NOT_ACTIVE",
    "message": "Session is not in a state that allows exit.",
    "details": { "status": "COMPLETED" },
    "requestId": "01JB9Z0K7Y8X4Q2M3N5P6R7S8T"
  }
}
```

## 7. Key data flows

### 7.1 Entry (guard creates a session)

1. Guard selects a site; the web app sends `siteId` in the body and the API **re-verifies** that
   site is in the guard's `assigned` scope.
2. Guard types the plate; the client sends the raw string. The API normalizes it per ADR-007,
   stores both `plate_id_original` and `plate_id_normalized`, and computes `plate_digest`.
3. The API creates the session in `PENDING_CLAIM` inside a transaction, creates an `entry_claims`
   row with a 256-bit claim token (hashed), and returns the **raw claim token once**.
4. The web app renders the entry QR from the raw token.
5. The audit log records `session.created` and `entry_claim.issued`.

### 7.2 Claim (guest scans the entry QR)

1. The guest's browser calls `POST /api/v1/entry-claims/claim` with the raw claim token.
2. The API hashes the token, looks it up, and checks: not expired, not revoked, not already
   claimed, session still `PENDING_CLAIM`.
3. Inside a transaction: create the ticket (one per session, enforced by a unique constraint),
   mark the claim claimed, transition the session `PENDING_CLAIM → ACTIVE`, write the audit row.
4. The API returns the ticket token **once** plus the safe public payload.
5. The ticket page renders a QR of the ticket token; the owner may screenshot it.

### 7.3 Exit (guard verifies and completes)

1. The guard scans the ticket QR or types the ticket reference.
2. `POST /api/v1/verification/exit` returns a **status object** (not a decision): `VALID`,
   `ALREADY_COMPLETED`, `REVOKED`, `EXPIRED`, `UNKNOWN`, `PLATE_MISMATCH`, `PAYMENT_PENDING`,
   `MANUAL_REVIEW_REQUIRED` — together with the plate, site, entry time, duration, fee preview,
   pricing policy version, and payment state.
3. The guard physically checks the plate, records the payment (or exemption), and presses
   **Authorize Exit**.
4. `POST /api/v1/parking-sessions/:id/exit/complete` performs the transactional completion shown
   in §6.

## 8. Cross-cutting mechanisms

| Mechanism | Implementation | Notes |
|---|---|---|
| Request correlation | `RequestIdInterceptor` stamps `X-Request-Id` on every response and every log line | Returned in the error envelope |
| Error contract | `AllExceptionsFilter` maps domain errors to stable `code` strings | No stack traces or SQL text in responses |
| Validation | Zod schemas in `@chlat/contracts`, applied by a global validation pipe | Rejects unknown keys |
| AuthN | `@nestjs/jwt` + `argon2id`; HTTP-only, `SameSite=Lax`, `Secure` cookies | Refresh token rotation |
| AuthZ | `PermissionGuard` (global `APP_GUARD`) + `ScopeResolver` + `AuthorizationService` | Deny-by-default |
| Rate limiting | `@nestjs/throttler`, stricter buckets on claim / verify / payment | See `features/security/` |
| CSRF | Double-submit token on cookie-authenticated mutations | Stateless bearer paths exempt |
| Idempotency | `Idempotency-Key` header honoured on retryable writes | Claim, payment record, exit complete |
| Audit | `AuditModule` writes rows inside the same transaction as the change it describes | Never fails the request, but never silently skips |
| Logging | Structured JSON; token fields are redacted by a logger interceptor | No raw claim/ticket tokens, no passwords |
| Migrations | Prisma migrations, applied in a controlled release step, never on app boot | See `../data/migrations.md` |
| Health | `/health/live` (process) and `/health/ready` (database + migration state) | Used by Coolify probes |

## 9. Scaling and failure behaviour

| Component | Scaling approach | Degradation mode |
|---|---|---|
| `apps/web` | Add replicas behind the proxy (stateless) | n/a |
| `apps/api` | Add replicas; the DB is the only shared state | Requires sticky-free routing; JWT is stateless |
| PostgreSQL | Vertical scaling for the pilot; a managed instance if needed | Hard outage → no entry/exit (see runbook) |
| Telegram module | Runs inside the API; failures must not block HTTP traffic | Webhook failures are retried by Telegram; errors are logged with a request id |

**Single-writer note:** exit completion uses `SELECT ... FOR UPDATE` on the session row (or an
optimistic `row_version` check) so that two concurrent guards pressing Authorize Exit produce
exactly one completion. The loser receives `EXIT_ALREADY_COMPLETED` — never a second completion.

## 10. Container decisions deferred

| Decision | Status | Reference |
|---|---|---|
| Local parking service container topology | Deferred | `offline-architecture.md`, ADR-003 |
| Offline event transport and queue technology | Deferred | ADR-003 |
| Separate worker for reports / exports | Deferred until report volume justifies it | — |
