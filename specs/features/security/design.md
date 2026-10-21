# Security — Design

**Status:** In progress
**Requirement IDs:** SEC-001 … SEC-018

---

## 1. Architecture

### 1.1 The request chain

```
                      ┌──────────────────── reverse proxy (Coolify Traefik) ───────────────────┐
                      │  TLS termination · HTTP→HTTPS redirect · rate limit · request id    │
                      └───────────────────────────────────┬──────────────────────────────────┘
                                                          │ HTTP (private network)
                      ┌───────────────────────────────────▼──────────────────────────────────┐
   apps/web ────────▶ │  apps/api                                                            │
   (browser)          │   1. RequestIdInterceptor        → requestId                     │
                      │   2. Helmet                      → security headers                │
                      │   3. Body size limit             → 413                             │
                      │   4. CORS                        → strict allowlist                │
                      │   5. CsrfGuard                   → cookie mutations only           │
                      │   6. JwtAuthGuard                → unless @Public()                │
                      │   7. PermissionGuard             → deny by default                 │
                      │   8. RateLimitGuard              → per-route budgets               │
                      │   9. ZodValidationPipe           → strict DTOs                     │
                      │  10. Controller → Service        → the domain rules                │
                      │  11. AllExceptionsFilter         → a consistent error envelope    │
                      │  12. RedactInterceptor           → log redaction                   │
                      └───────────────────────────────────┬──────────────────────────────────┘
                                                          │ SQL (private network)
                                                      ┌───▼────┐
                                                      │Postgres│  (no public exposure)
                                                      └────────┘
```

**The order matters.** The cheap rejections (size, CORS, CSRF) come before the expensive ones
(database lookups). The authorization check comes before the validation of the business payload,
because a caller with no access to the resource should not learn anything about its shape.

### 1.2 The browser is untrusted

The web app holds **no secrets and no signing keys**. It cannot decide whether a ticket is valid,
whether a fee is right, or whether an exit may be completed. Every one of those is an API
decision against database state.

## 2. Controls by requirement

| Req | Control | Where |
|---|---|---|
| SEC-001, SEC-002 | TLS at the proxy; HSTS; HTTP rejected for API traffic | `infra/coolify/proxy.md`, `apps/api/src/main.ts` |
| SEC-003 | Strict Zod DTOs in `@chlat/contracts`; a global validation pipe | `apps/api/src/common/pipes/zod-validation.pipe.ts` |
| SEC-004 | The cookie helpers in the auth module | `apps/api/src/modules/auth/cookies.ts` |
| SEC-005 | The double-submit CSRF guard | `apps/api/src/common/guards/csrf.guard.ts` |
| SEC-006 | A strict CORS allowlist from the environment | `apps/api/src/main.ts` |
| SEC-007 | Helmet's CSP; a lint rule banning `dangerouslySetInnerHTML` | `apps/api/src/main.ts`, `apps/web/eslint.config.js` |
| SEC-008 | `@nestjs/throttler` with per-route budgets | `apps/api/src/common/guards/rate-limit.guard.ts` |
| SEC-009 | `RequestIdInterceptor` | `apps/api/src/common/interceptors/request-id.interceptor.ts` |
| SEC-010 | `gitleaks` in CI | `.github/workflows/ci.yml` |
| SEC-011 | A CI check on `NEXT_PUBLIC_*` and on the built bundle | `.github/workflows/ci.yml` |
| SEC-012 | `RedactInterceptor` + the error filter | `apps/api/src/common/interceptors/redact.interceptor.ts` |
| SEC-013 | `AllExceptionsFilter` | `apps/api/src/common/filters/all-exceptions.filter.ts` |
| SEC-014 | A private network; a least-privilege DB role | `infra/postgres/roles.sql` |
| SEC-015 | `npm audit` / an OSV scan in CI; digest-pinned base images | `.github/workflows/ci.yml`, the Dockerfiles |
| SEC-016 | Format validation + Prisma's parameterisation | `@chlat/contracts` |
| SEC-017 | The route audit test against the reviewed allowlist | `apps/api/test/route-audit.spec.ts` |
| SEC-018 | A `Content-Type` check in the validation pipe | `apps/api/src/common/pipes/zod-validation.pipe.ts` |

## 3. Rate-limit budgets

| Route | Limit | Window | Key |
|---|---|---|---|
| `POST /auth/login` | 10 | 15 min | IP |
| `POST /auth/login` | 5 | 15 min | email |
| `POST /auth/refresh` | 30 | 15 min | IP |
| `POST /entry-claims/claim` | 20 | 1 min | IP |
| `POST /entry-claims/claim` | 5 | 1 min | session |
| `POST /verification/exit` | 60 | 1 min | guard |
| `POST /parking-sessions/:id/exit/complete` | 20 | 1 min | guard |
| `POST /parking-sessions/:id/payments` | 30 | 1 min | guard |
| `GET /admin/audit/export` | 1 | 1 min | actor |
| `GET /admin/plate/:digest` | 5 | 1 min | actor |
| Everything else | 300 | 1 min | IP |

The limiter must be backed by a shared store in production (the Redis instance Coolify provides,
or a database-backed store) so that multiple API replicas share the budget.

## 4. The error envelope

```jsonc
{
  "error": {
    "code": "EXIT_SESSION_NOT_ACTIVE",
    "message": "Session is not in a state that allows exit.",
    "details": { "status": "COMPLETED" },
    "requestId": "01JB9Z0K7Y8X4Q2M3N5P6R7S8T"
  }
}
```

* `code` — a stable, machine-readable identifier. The web app switches on it; the text may change.
* `message` — human-readable, safe to display, never containing internals.
* `details` — optional, structured, and always allow-listed per error type.
* `requestId` — the correlation id.

**Never in a response:** a stack trace, a SQL fragment, a Prisma error, a file path, an internal
identifier, a token, or a raw plate.

```ts
// apps/api/src/common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();

    const mapped = mapException(exception);   // domain errors → { code, status, message, details }
    const safe = mapped ?? {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: undefined,
    };

    if (!mapped) {
      this.logger.error({ err: exception, requestId: req.requestId });   // the full error, server-side only
    }

    res.status(safe.status).json({
      error: { code: safe.code, message: safe.message, details: safe.details, requestId: req.requestId },
    });
  }
}
```

## 5. Secret management

| Secret | Source | Rotation |
|---|---|---|
| `DATABASE_URL` | Coolify environment | On a credential change |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Coolify environment | A documented procedure (see below) |
| `PLATE_PEPPER` | Coolify environment | Rare; rotation breaks the historical digest continuity (ADR-010) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | Coolify environment | On a compromise |
| The DB role password | Coolify environment + the Postgres role | On a credential change |

**Rules**

* No secret in Git, ever — the CI secret scanner fails the build.
* No secret in a container image — the build does not receive them; they are injected at runtime.
* No secret in a `NEXT_PUBLIC_*` variable — anything with that prefix is public by definition. A CI
  check rejects a `NEXT_PUBLIC_*` name that looks like a secret.
* No secret in the browser bundle — a CI step greps the built client assets for the known secret
  values.

**JWT rotation.** The access secret is rotated by deploying with the new secret, then re-issuing
the refresh tokens: set the new secret, wait for the access TTL (15 min) to pass so all old access
tokens expire, then rotate the refresh secret, which forces every user to sign in again. A
dual-secret verification window (accepting the old and the new access secret for 15 minutes)
avoids a hard cutover.

## 6. Header configuration

```ts
// apps/api/src/main.ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Next.js inline styles for critical CSS
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", process.env.API_INTERNAL_URL],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },  // 180 days
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
```

The web app sets its own CSP in `next.config.js` with the same intent, plus
`Referrer-Policy: no-referrer` on the ticket pages so the claim token never leaves through the
referrer header.

## 7. Input validation

```ts
// packages/contracts/src/sessions.ts
export const CreateSessionDto = z.object({
  plateId: z.string().trim().min(1).max(32),
  clientReference: z.string().trim().max(64).optional(),
}).strict();   // ← strict: an unknown key is an error (SEC-003)
```

* `.strict()` on every DTO.
* A maximum length on every string.
* A format check on the plate, the ticket reference, and the tokens.
* A maximum array length and a maximum object depth on nested schemas.
* Numbers are bounded; a fee amount must be a non-negative safe integer.

**Parameterisation.** Prisma parameterises every query. There is no `$queryRaw` in the request
path; where raw SQL is unavoidable (the nightly consistency check, an aggregation), it uses
bound parameters and never string interpolation.

## 8. Security-relevant CI checks

| Check | Tool | Fails when |
|---|---|---|
| Secret scanning | `gitleaks` | A secret pattern appears in the repository or in the image history |
| Dependency audit | `npm audit --audit-level=high` / an OSV scan | A high or critical advisory is present |
| Route audit | The Jest test in `apps/api/test/route-audit.spec.ts` | A route lacks `@RequirePermissions` / `@Public()`, or a public route is not on the allowlist |
| Bundle secret scan | A `grep` over `apps/web/.next/static` | A known secret value appears |
| `NEXT_PUBLIC_*` name check | A script | A `NEXT_PUBLIC_*` name contains `SECRET`, `TOKEN`, `PASSWORD`, `KEY`, or `PEPPER` |
| Base image pinning | A script | A Dockerfile uses a floating tag instead of a digest |
| Lint | ESLint | `dangerouslySetInnerHTML` appears, or a `console.log` remains in the API |
| Typecheck | `tsc --noEmit` | Any type error |

## 9. Observability

| Signal | Purpose |
|---|---|
| `security_rate_limited_total{route}` | Probing or a runaway client |
| `security_csrf_rejected_total` | A CSRF attempt |
| `security_permission_denied_total` | Privilege probing |
| `security_scope_denied_total` | Cross-site probing |
| `auth_login_failed_total` | Credential stuffing |
| `security_content_type_rejected_total` | Parser-smuggling attempts |
| `http_5xx_total{route}` | A control has a bug |

Security events are sampled into the audit log; the metrics are the real-time signal.

## 10. Data model

The security controls add **no tables of their own**. Every one of them is either a middleware /
guard / interceptor in the request path, a configuration value, or a CI check. This section records
where each control's state lives, because "where does this live?" is the question that a reviewer
of a security control should be able to answer without reading the implementation.

| Control | Where its state lives | Notes |
|---|---|---|
| The session (the access and refresh cookies) | The `refresh_tokens` table + the signed access token | The token is stateless; the refresh token is server-side and revocable |
| The user's status and role | `users.status`, `users.role` | Read on every request, so a suspension is immediate |
| The effective permissions | `permissions`, `role_permissions`, `user_permission_grants` | The authoritative source; cached for 30 s, keyed by `authzVersion` |
| The actor's scope | `parking_owners`, `guard_site_assignments` | Derived from the data, never stored as a list |
| The revocation marker | `users.authzVersion` | Bumped on every authorization-affecting write |
| The rate-limit counters | The throttler's shared store (Redis in production) | Not the database; a limiter outage must not take the site down |
| The CSRF token | The `chlat_csrf` cookie + the session id in the token | The double-submit pair |
| The request id | The request context, the log line, the audit row | Generated per request, never accepted verbatim from the client |
| The secrets | The environment / the Coolify secret store | Never in the database, never in Git, never in the browser |
| The rate-limit budgets | A constant in the code | A configuration value per route, reviewed in a pull request |
| The public allowlist | The threat model + the route-audit test | A reviewed list, not a code constant, so a change forces a review |
| The redaction list | A constant in the logger interceptor | A denylist of field names to redact |

### 10.1 The one table this feature *does* add

The `refresh_tokens` table (see `features/authentication/` and `specs/data/schema.md` §3.13) is
the only persistent artefact the security layer introduces, and it exists for the refresh-token
rotation and reuse detection:

```prisma
model RefreshToken {
  id            String    @id @default(uuid()) @db.Uuid
  userId        String    @db.Uuid
  tokenHash     String    @unique
  familyId      String    @db.Uuid
  issuedAt      DateTime  @default(now()) @db.Timestamptz(3)
  expiresAt     DateTime  @db.Timestamptz(3)
  revokedAt     DateTime? @db.Timestamptz(3)
  revokedReason String?
  userAgent     String?
  ip            String?
  @@index([userId])
  @@index([familyId])
}
```

The `familyId` is what makes reuse detection possible: presenting a rotated token revokes the whole
family, which is the standard OAuth-family defence against a stolen refresh token.

## 11. Failure handling

The cross-cutting controls fail **closed**. If a control cannot evaluate, the request is rejected
rather than allowed. An authorization outage must never become an authorization bypass.

| Failure | Behaviour | Rationale |
|---|---|---|
| The authorization service cannot reach the database | 503 `SERVICE_UNAVAILABLE` | Never fall back to "allow" |
| The rate-limit store is unreachable | The request is allowed and the failure is counted | A limiter outage must not take the site down; the failure is visible in a metric and in the logs |
| The CSRF token is missing from the session | 403 `AUTH_CSRF_INVALID` | A session without a CSRF token is a broken session |
| The `X-Request-Id` header is present but malformed | A new id is generated | The inbound value is never trusted verbatim |
| The body exceeds the size limit | 413 | The limit is checked before the body is parsed |
| The `Content-Type` is wrong | 415 | The body is not parsed at all |
| The DTO schema rejects the body | 400 `VALIDATION_FAILED` with the field names | The client can fix the request |
| A secret is missing from the environment | The process refuses to start | A missing `PLATE_PEPPER` must not silently disable the digest |
| The error filter itself throws | The NestJS default handler responds | The fallback still returns a 500 without internals |
| The logger is unavailable | The request still completes | Logging must not break the request path |

**The one deliberate exception is the rate limiter.** Failing closed there would take the whole
site down during a Redis outage, which is a worse outcome than briefly exceeding a limit. The
failure is counted (`security_ratelimit_store_error_total`) and alerted.

## 12. Security considerations

The threat model lives in `specs/security/threat-model.md`; this section covers the design
decisions in *this* document that the threat model depends on.

| Design decision | The threat it answers |
|---|---|
| The browser holds no secret and makes no decision | Spoofing and elevation of privilege — the client cannot be trusted with an authorization outcome |
| The request chain checks the cheap rejections first | Denial of service — a malformed or oversized request never reaches a database query |
| The authorization check precedes the business validation | Information disclosure — a caller with no access to a resource does not learn its shape |
| The error envelope is uniform and allow-listed | Information disclosure — no stack trace, no SQL, no internal identifier |
| The redaction list is enforced by the interceptor, not by convention | Information disclosure through the logs |
| The `@Public()` allowlist is enforced by CI | Elevation of privilege — a route cannot be silently opened |
| The `NEXT_PUBLIC_*` convention is checked in CI | Information disclosure — a secret cannot be shipped to the browser by accident |
| The database has no public exposure and a least-privilege role | Information disclosure and tampering |
| The digest keys off the pepper for anything low-entropy | Spoofing of identity — the plate space is enumerable, so a plain hash is not enough |

**The residual risk of a rate-limiter outage** (the one fail-open path) is accepted and monitored.
Everything else fails closed.

## 13. Alternatives considered

| Alternative | Why rejected |
|---|---|
| Relying on the UI to hide unauthorized actions | The UI is a convenience, not a boundary. |
| A wildcard CORS origin | It would let any page call the API with the user's cookies. |
| `SameSite=Strict` | Breaks the deep-link and QR-scan landing flows. `Lax` plus an explicit CSRF token is the balance. |
| Storing tokens in `localStorage` | Readable by injected script. |
| A WAF instead of application controls | A WAF is a coarse net; the application controls are precise. |
| Skipping the dependency audit | The audit fails the build on high or critical findings, with an explicit override process for a false positive. |
| Encrypting the plate at rest beyond the digest | The plate is needed in the clear to display it at the exit. The digest handles the counting use case. |
