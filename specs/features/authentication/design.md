# Authentication — Design

**Status:** In progress
**Requirement IDs:** AUTH-001 … AUTH-014

---

## 1. Architecture

```
apps/web (Next.js)                      apps/api (NestJS)
─────────────────────                   ───────────────────────────────────────────
Login form ──POST /auth/login──────────▶ AuthController.login
                                        ├─ UsersService.findByEmail
                                        ├─ Argon2.verify(hash, password)
                                        ├─ TokenService.issueAccessToken(user)
                                        ├─ TokenService.issueRefreshToken(user)  → hashed in DB
                                        ├─ AuditModule.write('auth.login')
                                        └─ Set-Cookie: access_token, refresh_token (HttpOnly, Secure, SameSite=Lax)

Server component ──GET /auth/me────────▶ AuthController.me
                                        └─ JwtAuthGuard → AuthorizationService.effectivePermissions(actor)
                                           → returns { user, role, scopeKind, siteScope, permissions }

API client ──401 AUTH_TOKEN_EXPIRED────▶ interceptor → POST /auth/refresh (rotating)
                                        └─ new tokens; old refresh token invalidated

Logout ─────────POST /auth/logout──────▶ revoke refresh token, clear cookies, audit
```

**Token strategy**

| Token | Storage (client) | Storage (server) | Lifetime | Transport |
|---|---|---|---|---|
| Access token | HTTP-only cookie `chlat_at` | not stored (stateless JWT) | 15 min | Cookie |
| Refresh token | HTTP-only cookie `chlat_rt` | `refresh_tokens` table, hashed | 7 d (role-capped) | Cookie |
| CSRF token | non-HTTP-only cookie `chlat_csrf` + `X-CSRF-Token` header | bound to the session id in the token payload | session lifetime | Header |

The access token is a JWT signed with `JWT_ACCESS_SECRET` (HS256 or EdDSA, decided at
implementation; the payload is symmetric-signed to allow stateless verification):

```json
{
  "sub": "<user id>",
  "role": "guard",
  "scopeKind": "assigned",
  "sid": "<session id>",
  "av": 7,
  "iat": 1758432000,
  "exp": 1758432900,
  "iss": "chlat-park",
  "aud": "chlat-park-api"
}
```

`av` is the actor's `authzVersion` at issue time. The API compares it against the current
`authzVersion` on each request; a mismatch invalidates the token (belt and braces alongside the
`authzVersion` cache key). The `scopeKind` in the payload is the **coarse** layer only — the
authoritative scope is always re-resolved from the database.

## 2. Data model

```prisma
model User {
  id            String    @id @default(uuid()) @db.Uuid
  email         String?   @unique
  phone         String?   @unique
  passwordHash  String?
  displayName   String?
  role          UserRole  @default(user)
  status        UserStatus @default(active)
  scopeKind     ScopeKind @default(self)
  authzVersion  Int       @default(1)
  lastLoginAt   DateTime?
  passwordChangedAt DateTime?
  createdAt     DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime  @updatedAt @db.Timestamptz(3)
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @db.Uuid
  tokenHash  String   @unique
  familyId   String   @db.Uuid   // all tokens descended from one login
  issuedAt   DateTime @default(now()) @db.Timestamptz(3)
  expiresAt  DateTime @db.Timestamptz(3)
  revokedAt  DateTime? @db.Timestamptz(3)
  revokedReason String?
  userAgent  String?
  ip         String?
  @@index([userId])
  @@index([familyId])
}
```

`familyId` implements refresh-token rotation with reuse detection: presenting an already-rotated
token revokes the entire family and forces a new login.

## 3. State transitions

### 3.1 Session (refresh-token family)

```
   login
     │
     ▼
  ACTIVE ──refresh (rotates)──▶ ACTIVE (new token, old revoked)
     │
     ├── logout ──────────────▶ REVOKED (reason: logout)
     ├── password changed ────▶ REVOKED (reason: password_change)
     ├── user suspended ──────▶ REVOKED (reason: account_suspended)
     ├── replay detected ──────▶ REVOKED (family revoked, reason: reuse_detected)
     └── expiry ──────────────▶ EXPIRED
```

| From | Event | To | Preconditions |
|---|---|---|---|
| — | login | ACTIVE | user exists, status = active, password verifies |
| ACTIVE | refresh | ACTIVE | token exists, not revoked, not expired, family not revoked |
| ACTIVE | logout / password change / suspension / reuse | REVOKED | — |
| ACTIVE | now > expiresAt | EXPIRED | — |

### 3.2 User status

```
  pending ──first-login/activation──▶ active ──suspend──▶ suspended ──reinstate──▶ active
```

`pending` accounts cannot log in. `suspended` accounts keep all their data and audit history.

## 4. Failure handling

| Failure | Response | Handling |
|---|---|---|
| Unknown email | 401 `AUTH_INVALID_CREDENTIALS` | Constant-time dummy Argon2 verify so the timing does not reveal existence |
| Wrong password | 401 `AUTH_INVALID_CREDENTIALS` | Increment the per-email failure counter |
| Suspended user | 403 `AUTH_ACCOUNT_SUSPENDED` | Revoke the token family |
| Expired access token | 401 `AUTH_TOKEN_EXPIRED` | The web app refreshes transparently and retries once |
| Invalid/tampered token | 401 `AUTH_TOKEN_INVALID` | The web app clears the session and shows the login screen |
| Replayed refresh token | 401 `AUTH_REFRESH_REPLAYED` | Revoke the family; force re-login |
| CSRF mismatch | 403 `AUTH_CSRF_INVALID` | Audit as a security event |
| Rate limit exceeded | 429 with `Retry-After` | Audit a `security.rate_limited` row (sampled) |
| `authzVersion` mismatch | 401 `AUTH_TOKEN_STALE` | Force a refresh so the new token carries the new version |
| Database unavailable | 503 `SERVICE_UNAVAILABLE` | Never fall back to a permissive mode |

**Never** does the API return a different status code for "no such user" and "wrong password". The
only exception is `AUTH_ACCOUNT_SUSPENDED`, which is returned **only after** the password verifies
— otherwise it leaks account existence to an unauthenticated attacker.

## 5. Security considerations

| Threat | Control |
|---|---|
| Credential stuffing | Rate limit per IP and per email; uniform error message; constant-time comparison |
| Password reuse across services | Argon2id with a per-password salt; no password reuse enforcement in the MVP (deferred) |
| Session fixation | A fresh session id is issued on every login; the old session is invalidated |
| Refresh-token theft (XSS) | HTTP-only cookies; the access token is not readable by JavaScript; the CSRF token is the only script-readable value |
| Refresh-token replay | Rotation + family revocation |
| CSRF | Double-submit token bound to the session id; `SameSite=Lax`; the origin is checked on cookie-authenticated mutations |
| XSS token theft | `Content-Security-Policy` without `unsafe-inline`; no `dangerouslySetInnerHTML` for user data |
| Stale privilege | `authzVersion` in the token plus the DB-backed fine-grained check on every request |
| Log leakage | `password`, `passwordHash`, `authorization`, `cookie`, `set-cookie` and any `*_hash` are redacted by the logger interceptor |
| Timing attacks | Dummy Argon2 verification for unknown emails |
| Session length | Role-capped lifetimes; the server enforces the cap regardless of the client request |
| Account enumeration | Uniform `AUTH_INVALID_CREDENTIALS`; no email in the error payload |

**Cookies**

```
Set-Cookie: chlat_at=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900
Set-Cookie: chlat_rt=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=...
Set-Cookie: chlat_csrf=<opaque>; Secure; SameSite=Lax; Path=/
```

`chlat_rt` is scoped to `/api/v1/auth` so it is not attached to every API call.

## 6. Observability

| Event | Where |
|---|---|
| `auth.login` | Audit log (success) |
| `auth.login_failed` | Audit log, with a redacted email hint (e.g. `a***@example.com`) and the failure reason |
| `auth.logout` | Audit log |
| `auth.refresh` | Audit log (optional, sampled to reduce volume) |
| `auth.token_reuse_detected` | Audit log + security alert |
| `security.rate_limited` | Metrics counter + sampled audit row |
| `auth.login_duration_ms` | Metrics histogram, by outcome |

Metrics: `auth_login_total{outcome}`, `auth_refresh_total{outcome}`,
`auth_rate_limited_total{route}`.

## 7. Alternatives considered

| Alternative | Why rejected |
|---|---|
| JWT-only, no refresh token | A 15-minute session with no way to extend it forces guards to re-login mid-shift, and a stolen JWT cannot be revoked. |
| Sessions stored in PostgreSQL only (no JWT) | Simpler revocation, but every request hits the database. A JWT + a DB-backed refresh token is a better balance at pilot scale. |
| Long-lived JWT with no rotation | Cannot revoke a compromised token; violates AUTH-010. |
| Local storage for tokens | Readable by any injected script; defeats the HttpOnly requirement. |
| Argon2id vs bcrypt vs scrypt | Argon2id is the current OWASP first choice and is memory-hard, which raises the cost of GPU cracking. |
| `SameSite=Strict` | Breaks the Telegram deep link return flow and cross-site entry from a QR scan landing page. `Lax` plus an explicit CSRF token is the chosen balance. |
