# Security — Tasks

**Status:** In progress
**Requirement IDs:** SEC-001 … SEC-018

---

## Phase A — Transport and headers

- [ ] **T-A1 — Proxy TLS configuration and the HTTP→HTTPS behaviour.**
  Satisfies: SEC-001, SEC-002.
  Files: `infra/coolify/proxy.md`, `apps/api/src/main.ts`.
  Notes: TLS 1.2+; HSTS with a 180-day `max-age`; plain HTTP rejected for API traffic.

- [ ] **T-A2 — Helmet and the security headers.**
  Satisfies: SEC-001, SEC-007.
  Files: `apps/api/src/main.ts`, `apps/web/next.config.js`.
  Notes: the CSP from `design.md` §6; `Referrer-Policy: no-referrer` on the ticket pages; the
  `X-Request-Id` header.

- [ ] **T-A3 — The CORS allowlist.**
  Satisfies: SEC-006.
  Files: `apps/api/src/main.ts`.
  Notes: the origin comes from the environment; no wildcard; `credentials: true` is only allowed
  with an explicit origin.

- [ ] **T-A4 — The request id.**
  Satisfies: SEC-009.
  Files: `apps/api/src/common/interceptors/request-id.interceptor.ts`.
  Notes: read the inbound `X-Request-Id` if it is a valid ULID, otherwise generate one; echo it
  on the response; attach it to the request context.

## Phase B — Input and output

- [ ] **T-B1 — The strict validation pipe.**
  Satisfies: SEC-003, SEC-018.
  Files: `apps/api/src/common/pipes/zod-validation.pipe.ts`.
  Notes: `.strict()` on every schema; a `Content-Type` check; the error details name the offending
  field; the body size limit.

- [ ] **T-B2 — The DTO schemas.**
  Satisfies: SEC-003, SEC-016.
  Files: `packages/contracts/src/*.ts`.
  Notes: a maximum length on every string; a format check on the plate, the reference, and the
  tokens; bounded numbers; bounded arrays.

- [ ] **T-B3 — The error filter.**
  Satisfies: SEC-013.
  Files: `apps/api/src/common/filters/all-exceptions.filter.ts`, `.spec.ts`.
  Notes: a stable code per error type; a safe message; the details are allow-listed; the full
  exception is logged server-side only.

- [ ] **T-B4 — The redaction interceptor.**
  Satisfies: SEC-012.
  Files: `apps/api/src/common/interceptors/redact.interceptor.ts`.
  Notes: the redacted keys list; the plate is replaced by the digest; a unit test that scans a
  captured log.

- [ ] **T-B5 — The CSRF guard.**
  Satisfies: SEC-005.
  Files: `apps/api/src/common/guards/csrf.guard.ts`.
  Notes: the cookie-authenticated mutating methods only; the double-submit token; the session
  binding.

## Phase C — Rate limiting

- [ ] **T-C1 — The rate-limit guard and the shared store.**
  Satisfies: SEC-008.
  Files: `apps/api/src/common/guards/rate-limit.guard.ts`, `apps/api/src/modules/throttler/`.
  Notes: a shared store in production so the replicas share the budget; the `Retry-After` header.

- [ ] **T-C2 — The per-route budgets.**
  Satisfies: SEC-008.
  Files: the controllers.
  Notes: the table from `design.md` §3; a test per budget.

- [ ] **T-C3 — The security metrics.**
  Satisfies: SEC-008.
  Files: `apps/api/src/modules/metrics/`.
  Notes: the counters from `design.md` §9.

## Phase D — Secrets and the database

- [ ] **T-D1 — The environment validation.**
  Satisfies: SEC-010, SEC-011.
  Files: `apps/api/src/config/env.validation.ts`, `apps/web/...`.
  Notes: the required secrets are listed; the app refuses to start without them; a `NEXT_PUBLIC_*`
  name that looks like a secret is rejected at build time.

- [ ] **T-D2 — The least-privilege database roles.**
  Satisfies: SEC-014.
  Files: `infra/postgres/roles.sql`.
  Notes: the application role has no `UPDATE`/`DELETE` on `audit_logs`; the migrations role is
  separate; the database is not exposed publicly.

- [ ] **T-D3 — The secret scanner in CI.**
  Satisfies: SEC-010.
  Files: `.github/workflows/ci.yml`.
  Notes: `gitleaks` over the repository and the image history; the failure output is actionable.

- [ ] **T-D4 — The bundle secret scan.**
  Satisfies: SEC-011.
  Files: `.github/workflows/ci.yml`.
  Notes: grep the built client assets for the environment secret values; and the `NEXT_PUBLIC_*`
  name check.

- [ ] **T-D5 — The dependency audit and the image pinning.**
  Satisfies: SEC-015.
  Files: `.github/workflows/ci.yml`, `apps/web/Dockerfile`, `apps/api/Dockerfile`.
  Notes: the audit fails on high or critical; the base images are digest-pinned.

## Phase E — Verification

- [ ] **T-E1 — The header test.**
  Satisfies: SEC-001, SEC-007, SEC-009.
  Files: `apps/api/test/security.e2e-spec.ts`.
  Notes: assert the presence of the CSP, the HSTS, and the `X-Request-Id`.

- [ ] **T-E2 — The CORS test.**
  Satisfies: SEC-006.
  Files: `apps/api/test/security.e2e-spec.ts`.
  Notes: a foreign origin gets no allow-origin header; the configured origin does.

- [ ] **T-E3 — The CSRF test.**
  Satisfies: SEC-005.
  Files: `apps/api/test/security.e2e-spec.ts`.
  Notes: a missing token, a foreign token, and a valid token.

- [ ] **T-E4 — The content-type and validation test.**
  Satisfies: SEC-003, SEC-018.
  Files: `apps/api/test/security.e2e-spec.ts`.
  Notes: a `text/plain` body is 415; an unknown body field is 400.

- [ ] **T-E5 — The error-leak test.**
  Satisfies: SEC-012, SEC-013.
  Files: `apps/api/test/security.e2e-spec.ts`.
  Notes: force a database error and assert the response has no SQL text and the log has no token.

- [ ] **T-E6 — The SQL-injection test.**
  Satisfies: SEC-016.
  Files: `apps/api/test/security.e2e-spec.ts`.
  Notes: a plate with a metacharacter is stored literally; no error is returned.
