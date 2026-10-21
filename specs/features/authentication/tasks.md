# Authentication — Tasks

**Status:** In progress
**Requirement IDs:** AUTH-001 … AUTH-014
**Convention:** each task lists the requirement IDs it satisfies and the files it is expected to
touch. Tasks are ordered; a task may not start before the ones above it are merged.

---

## Phase A — Foundation

- [ ] **T-A1 — `users` + `refresh_tokens` Prisma models and migration.**
  Satisfies: AUTH-001, AUTH-005.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*_init/migration.sql`,
  `specs/data/schema.md`.
  Notes: add `lastLoginAt`, `passwordChangedAt`, `refreshTokens`; index `userId` and `familyId`.

- [ ] **T-A2 — Environment validation for auth secrets.**
  Satisfies: AUTH-004, AUTH-002.
  Files: `apps/api/src/config/env.validation.ts`.
  Notes: require `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to be distinct and at least 32 bytes;
  fail fast at boot with a clear message.

- [ ] **T-A3 — Password hashing service (Argon2id).**
  Satisfies: AUTH-002, AUTH-003.
  Files: `apps/api/src/modules/auth/password.service.ts`,
  `apps/api/src/modules/auth/password.service.spec.ts`.
  Notes: unit-test hash/verify, wrong-password rejection, and that the hash embeds the salt.

- [ ] **T-A4 — Token service: issue, verify, rotate.**
  Satisfies: AUTH-004, AUTH-005, AUTH-014.
  Files: `apps/api/src/modules/auth/token.service.ts`, `token.service.spec.ts`.
  Notes: access JWT (15 min) + opaque refresh token; refresh token stored hashed; rotation returns
  the new raw token exactly once; verify produces the distinct `AUTH_TOKEN_EXPIRED` /
  `AUTH_TOKEN_INVALID` codes.

- [ ] **T-A5 — Cookie helpers.**
  Satisfies: AUTH-004, AUTH-013.
  Files: `apps/api/src/modules/auth/cookies.ts`.
  Notes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path` scoping for the refresh cookie; the CSRF
  cookie is readable by script by design.

## Phase B — Endpoints

- [ ] **T-B1 — `POST /auth/login`.**
  Satisfies: AUTH-001, AUTH-002, AUTH-003, AUTH-006, AUTH-007, AUTH-008, AUTH-012.
  Files: `apps/api/src/modules/auth/auth.controller.ts`, `auth.service.ts`, `auth.service.spec.ts`.
  Notes: uniform error message; the suspension error is only returned after the password verifies;
  role-capped refresh lifetime; rate-limit integration; audit row.

- [ ] **T-B2 — `POST /auth/refresh` with reuse detection.**
  Satisfies: AUTH-005, AUTH-010, AUTH-014.
  Files: `apps/api/src/modules/auth/auth.controller.ts`, `token.service.ts`.
  Notes: rotate; on presenting a revoked token, revoke the whole family and audit
  `auth.token_reuse_detected`.

- [ ] **T-B3 — `POST /auth/logout`.**
  Satisfies: AUTH-009.
  Files: `apps/api/src/modules/auth/auth.controller.ts`.
  Notes: revoke the presented refresh token, clear both cookies, audit.

- [ ] **T-B4 — `GET /auth/me` (actor context).**
  Satisfies: AUTH-001, AUTH-010, AUTH-012.
  Files: `apps/api/src/modules/auth/auth.controller.ts`, `auth.service.ts`.
  Notes: returns `{ user, role, scopeKind, siteScope, permissions, reauthAt }`; never returns
  `passwordHash`.

- [ ] **T-B5 — `POST /auth/password` (change) and forced reset.**
  Satisfies: AUTH-011.
  Files: `apps/api/src/modules/auth/auth.controller.ts`, `auth.service.ts`.
  Notes: revokes all other token families; sets `passwordChangedAt`; requires the current password.

- [ ] **T-B6 — Re-authentication guard.**
  Satisfies: AUTH-011.
  Files: `apps/api/src/common/guards/reauth.guard.ts`, `apps/api/src/common/decorators/reauth.ts`.
  Notes: sensitive routes carry `@RequireReauth(30)`; the guard compares `reauthAt` in the session
  and returns `428 AUTH_REAUTH_REQUIRED` when stale.

## Phase C — Cross-cutting

- [ ] **T-C1 — `JwtAuthGuard`.**
  Satisfies: AUTH-001, AUTH-010, AUTH-014.
  Files: `apps/api/src/common/guards/jwt-auth.guard.ts`.
  Notes: verify `iss`/`aud`/`exp`/`nbf`; check `status` and `authzVersion`; attach the actor.

- [ ] **T-C2 — CSRF double-submit protection.**
  Satisfies: AUTH-013.
  Files: `apps/api/src/common/guards/csrf.guard.ts`, `apps/api/src/common/middleware/csrf.ts`.
  Notes: applies only to cookie-authenticated mutating methods; bearer-token routes are exempt;
  reject with `AUTH_CSRF_INVALID`; audit a security event.

- [ ] **T-C3 — Rate-limit guards for auth routes.**
  Satisfies: AUTH-008.
  Files: `apps/api/src/common/guards/rate-limit.guard.ts`, `apps/api/src/modules/auth/auth.controller.ts`.
  Notes: two buckets (per IP, per email); `Retry-After` header; a 15-minute window.

- [ ] **T-C4 — Logger redaction.**
  Satisfies: AUTH-003.
  Files: `apps/api/src/common/interceptors/redact.interceptor.ts`, `logging/logger.ts`.
  Notes: redact `password`, `passwordHash`, `authorization`, `cookie`, `set-cookie`, `*_hash`, and
  the bot token.

- [ ] **T-C5 — Security headers and CORS.**
  Satisfies: AUTH-013.
  Files: `apps/api/src/main.ts`, `apps/web/middleware.ts`.
  Notes: Helmet with a CSP that has no `unsafe-inline`; a strict CORS allowlist containing only the
  app origin; `X-Request-Id` on every response.

- [ ] **T-C6 — Audit rows for auth events.**
  Satisfies: AUTH-006, AUTH-009.
  Files: `apps/api/src/modules/audit/`, `apps/api/src/modules/auth/auth.service.ts`.
  Notes: `auth.login`, `auth.login_failed`, `auth.logout`, `auth.token_reuse_detected`.

## Phase D — Web

- [ ] **T-D1 — Login and logout UI.**
  Satisfies: AUTH-001, AUTH-009.
  Files: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/login/LoginForm.tsx`.
  Notes: Khmer and English labels; clear error states; a disabled-while-submitting button.

- [ ] **T-D2 — Auth-aware server client with automatic refresh.**
  Satisfies: AUTH-014.
  Files: `apps/web/src/lib/api/server-client.ts`, `apps/web/src/lib/api/fetch.ts`.
  Notes: on `401 AUTH_TOKEN_EXPIRED`, refresh once and retry; on `AUTH_TOKEN_INVALID`, clear the
  session and redirect to the login screen.

- [ ] **T-D3 — Route protection for `/guard/*`, `/owner/*`, `/admin/*`.**
  Satisfies: AUTH-001.
  Files: `apps/web/src/middleware.ts`, `apps/web/src/app/(guard)/layout.tsx`.
  Notes: UI protection is a convenience only; the API remains the enforcement point.

## Phase E — Verification

- [ ] **T-E1 — Integration tests against a real database.**
  Satisfies: AUTH-001, AUTH-005, AUTH-006, AUTH-007, AUTH-010.
  Files: `apps/api/test/auth.e2e-spec.ts`.
  Notes: suspend-then-request, replay detection, audit rows.

- [ ] **T-E2 — Abuse tests.**
  Satisfies: AUTH-008, AUTH-011, AUTH-013.
  Files: `apps/api/test/auth-abuse.e2e-spec.ts`.
  Notes: rate limit, CSRF missing header, re-auth required, uniform error message for unknown email
  vs wrong password.

- [ ] **T-E3 — Secret scanning.**
  Satisfies: AUTH-003.
  Files: `.github/workflows/ci.yml`.
  Notes: `gitleaks` (or equivalent) over the repository and the image layers.
