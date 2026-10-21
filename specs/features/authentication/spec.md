# Authentication

**Status:** In progress
**Requirement IDs:** AUTH-001 … AUTH-014
**Depends on:** `authorization` (fine-grained authz consumes the actor context)

---

## 1. Problem

Guards, parking owners, and platform administrators each need to sign in to a web application and
be identified unambiguously in every audit record. A shared terminal login is unacceptable: a
session, a payment, or a fee exemption must always be attributable to a named person. At the same
time, the **guest** motorcycle owner must be able to claim a ticket and exit parking **without any
account at all** — registration is never a prerequisite for parking.

The system therefore needs two very different identity paths:

* **Interactive identity** — staff (guard / owner / admin) with credentials, a session cookie, and
  revocation.
* **Bearer identity** — guests and owners holding an opaque token (claim token, ticket token) with
  no login, no password, and no personal data.

## 2. Scope

### 2.1 In scope

* Email + password sign-in for staff accounts.
* Argon2id password hashing.
* Short-lived access token + rotating refresh token in HTTP-only cookies.
* Logout, refresh, and immediate revocation on suspension.
* Password change, and a forced reset path for a first-login bootstrap.
* Per-role session lifetime policy.
* Re-authentication for a small set of sensitive actions.
* Guest bearer-token flows (the claim token and the ticket token) — the tokens themselves are
  specified in `entry-qr-claim` and `guest-ticket`.
* Security headers, CORS, and CSRF protection for cookie-authenticated mutations.

### 2.2 Out of scope

* OAuth / social login.
* SMS one-time passwords and email magic links.
* Multi-factor authentication — **planned before production** (see §7 and ADR open items).
* Telegram-identity login (P1; `account.telegram.link` is an identity-linking feature, not a login
  method in the MVP).

## 3. Actors

| Actor | Interaction |
|---|---|
| Security guard | Signs in, works the dashboard, signs out at the end of the shift |
| Parking owner | Signs in to the owner console |
| Platform administrator | Signs in to the admin console |
| Guest motorcycle owner | Never signs in; presents an opaque token |
| Registered motorcycle owner | Signs in to see ticket history; still may park as a guest |

## 4. Behaviour

1. The actor submits an email and password to `POST /api/v1/auth/login`.
2. The API looks the user up by email, verifies the password with Argon2id, and checks that
   `status = 'active'`.
3. On success it issues an access token (short-lived) and a refresh token (rotating), sets both as
   HTTP-only cookies, and writes an `auth.login` audit row.
4. The web app calls `GET /api/v1/auth/me` to load the actor context: role, scope kind, resolved
   site scope, and the effective permission list.
5. On each request the API verifies the access token, loads the actor, and attaches it to the
   request context. A suspended user is rejected immediately, regardless of token validity.
6. When the access token expires, the web app silently calls `POST /api/v1/auth/refresh` with the
   refresh cookie. The old refresh token is invalidated and a new one issued.
7. `POST /api/v1/auth/logout` revokes the refresh token and clears the cookies.
8. A failed login is rejected with the same generic message regardless of whether the email exists,
   and is rate-limited per IP and per email.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| AUTH-001 | The system must authenticate staff using an email address and a password, and must reject any credential pair that does not match a user with `status = 'active'`. | P0 |
| AUTH-002 | Passwords must be hashed with Argon2id using per-password salts and a memory-hard parameter set (minimum 19 MiB memory, 2 iterations, parallelism 1), verified against the OWASP baseline at the time of implementation. | P0 |
| AUTH-003 | The system must never store, log, echo, or return a plaintext password, and must never return `passwordHash` in any API response. | P0 |
| AUTH-004 | A successful login must return an access token valid for at most 15 minutes and a refresh token valid for at most 7 days, and must set both as `HttpOnly`, `Secure`, `SameSite=Lax` cookies scoped to the application domain. | P0 |
| AUTH-005 | The refresh token must be stored server-side (hashed), must be rotated on every use, and must be invalidated on use so that a replayed refresh token is rejected and the token family is revoked. | P0 |
| AUTH-006 | A successful login must be recorded in the audit log with the actor, the site scope resolved at that moment, the user agent, and the source IP. | P0 |
| AUTH-007 | A failed login must return HTTP 401 with the generic error code `AUTH_INVALID_CREDENTIALS` and must not reveal whether the email address exists. | P0 |
| AUTH-008 | The login endpoint must be rate-limited to at most 10 attempts per IP per 15 minutes and at most 5 attempts per email per 15 minutes; exceeding the limit must return HTTP 429 with `Retry-After`. | P0 |
| AUTH-009 | On `POST /api/v1/auth/logout` the system must revoke the presented refresh token, clear both cookies, and record an `auth.logout` audit row. | P0 |
| AUTH-010 | When a user's `status` changes to `suspended` or `pending`, the system must reject their requests immediately — regardless of the validity of a previously issued access token — and must revoke all outstanding refresh tokens for that user. | P0 |
| AUTH-011 | The system must require a fresh successful authentication (a re-authentication timestamp newer than 30 minutes) before executing a sensitive action, defined as: changing a password, inviting or deactivating staff, changing pricing, granting or revoking a permission, exporting audit data, and voiding a payment. | P0 |
| AUTH-012 | Session lifetimes must be role-dependent: guard 12 h, owner 8 h, super admin 4 h. The server must enforce the maximum; a client-supplied longer lifetime must be ignored. | P0 |
| AUTH-013 | All cookie-authenticated mutating requests must be protected against CSRF, using a double-submit token bound to the session, and the server must reject the request with `AUTH_CSRF_INVALID` when the header token is missing or does not match. | P0 |
| AUTH-014 | The system must return HTTP 401 with the code `AUTH_TOKEN_EXPIRED` when an expired access token is presented, and HTTP 401 with `AUTH_TOKEN_INVALID` when a malformed or tampered token is presented; the two must be distinguishable by clients so the web app can trigger a refresh. | P0 |

## 6. Acceptance criteria

### Normal

* **AUTH-001, AUTH-002** — Given a guard with a known password, when they submit the correct email
  and password, then the response is `200` and the audit log contains an `auth.login` row for that
  user.
* **AUTH-004** — Given a successful login, when the response is inspected, then both cookies are
  present with `HttpOnly` and `Secure`, and the access token expires within 15 minutes.
* **AUTH-005** — Given a valid refresh token, when it is used, then a new refresh token is issued
  and the old one is invalidated; when the old one is replayed, then the request is rejected with
  `AUTH_REFRESH_REPLAYED` and the whole token family is revoked.
* **AUTH-006** — Given a successful login, when the audit log is queried, then an `auth.login` row
  exists containing the actor, the IP, and the user agent.
* **AUTH-012** — Given a super admin, when they sign in, then the refresh token lifetime is at most
  4 hours.

### Failure

* **AUTH-007** — Given a non-existent email, when a login is attempted, then the response is `401`
  with the code `AUTH_INVALID_CREDENTIALS` and the message is byte-identical to the message
  returned for a wrong password.
* **AUTH-001** — Given a suspended user, when they submit valid credentials, then the response is
  `403` with the code `AUTH_ACCOUNT_SUSPENDED`.
* **AUTH-014** — Given an expired access token, when it is presented, then the response is `401`
  with `AUTH_TOKEN_EXPIRED`; given a token with a modified signature, then the response is `401`
  with `AUTH_TOKEN_INVALID`.
* **AUTH-010** — Given a user with a valid access token, when the user is suspended, then the next
  request with that token is rejected without waiting for the token to expire.

### Abuse

* **AUTH-008** — Given 6 failed logins for the same email from the same IP, when a 7th is attempted,
  then the response is `429` and no credential check is performed.
* **AUTH-013** — Given a valid session cookie, when a mutating request is sent without the CSRF
  header, then the response is `403` with `AUTH_CSRF_INVALID` and no state change occurs.
* **AUTH-011** — Given a session older than 30 minutes, when the actor attempts to void a payment,
  then the response is `428` with `AUTH_REAUTH_REQUIRED` and the action is not performed.
* **AUTH-002** — Given a stored password hash in the database, when it is inspected, then it is an
  Argon2id hash and does not contain the plaintext password.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Which second factor will super admins be required to use before production (TOTP app vs. hardware key)? | Product owner | Before Phase 7 |
| Q2 | Should a super admin be able to reset another user's password directly, and if so with what audit trail? | Product owner | Before Phase 7 |
| Q3 | What is the exact Argon2id parameter set for the pilot hardware (memory cost vs. the low-power guard terminals)? | Engineering | Phase 1 |

## 8. Related

* `specs/features/authorization/` — what happens after authentication.
* `specs/security/threat-model.md` — credential-stuffing and session-fixation analysis.
* `specs/data/schema.md` — `users`, `refresh_tokens`.
* `specs/api/openapi.yaml` — `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me`.
