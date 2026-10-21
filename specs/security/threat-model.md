# Chlat-Park — Threat Model

**Status:** Accepted
**Last updated:** 2026-10-21
**Method:** STRIDE, applied per trust boundary.
**Related:** [`access-control-matrix.md`](./access-control-matrix.md) · [`../architecture/rbac-design.md`](../architecture/rbac-design.md) · [`../features/security/`](../features/security/)

---

## 1. Scope and assumptions

**In scope:** the web/PWA, the guard dashboard, the NestJS API, the Telegram bot module, the
database, the backup path, the deployment, and the operational procedures.

**Out of scope:** camera and ANPR (out of scope by decision L6), barrier control, the physical
security of the parking lot, the VPS hypervisor, and the Coolify platform itself (assumed to be
correctly configured).

**Assumptions**

* The browser, the Telegram client, and the guard's device are **untrusted**. Any of them may be
  modified, shared, or stolen.
* The reverse proxy terminates TLS correctly and the database is not publicly reachable.
* The staff accounts are individually held. A shared terminal login is a procedural violation, and
  the audit trail would attribute an action to the wrong person.
* The server clock is roughly correct (a drift alert fires at more than 60 s).

## 2. Assets

| # | Asset | Why it matters | Classification |
|---|---|---|---|
| A1 | The **plate digest pepper** | It links the readable plates to the digest. Leaking it makes the digest reversible by brute force over the plate space. | **Critical secret** |
| A2 | The **JWT secrets** | A forged token is a forged identity. | **Critical secret** |
| A3 | The **database credentials** | Full read/write on the operational data. | **Critical secret** |
| A4 | The **session state** | A session decides what the parking lot may do. | High |
| A5 | The **payment records** | Money. | High |
| A6 | The **audit log** | The evidence that the system is accountable. | High |
| A7 | The **readable plate** | Personal data of the motorcycle's owner, who may have no relationship with the parking lot. | High (personal) |
| A8 | The **raw ticket token** | A bearer credential for one exit. | High (transient) |
| A9 | The **raw claim token** | A bearer credential for one claim. | Medium (transient, short-lived) |
| A10 | The **Telegram bot token** | Impersonation of the bot; a webhook forgery. | High |
| A11 | The **pricing policies** | The revenue rules. | Medium |
| A12 | The **backups** | A copy of everything, including the readable plates. | High |
| A13 | The **owner revenue and adoption analytics** | Business-confidential; a competitive signal. | Medium |
| A14 | The **session and ticket state** | Whether a motorcycle may leave. | High |

## 3. Trust boundaries

| # | Boundary | What crosses it | Controls |
|---|---|---|---|
| TB-1 | The public internet → the reverse proxy | Every HTTP request | TLS, HSTS, the request size limit, the proxy rate limit |
| TB-2 | The reverse proxy → `apps/web` | HTTP | An internal network; the web app holds no secrets |
| TB-3 | `apps/web` → `apps/api` | HTTP | The API is the trust anchor; the web app is a pure client |
| TB-4 | `apps/api` → PostgreSQL | SQL | A private network, the environment credentials, Prisma's parameterisation, a least-privilege role |
| TB-5 | `apps/api` → Telegram | HTTPS | The webhook secret token; the bot token from the environment |
| TB-6 | The browser → `apps/api` | HTTPS | The cookie session, CSRF, the DTO validation, the deny-by-default authorization |
| TB-7 | The guard's device → the site | Physical | Out of scope — but the plate check is a *human* control, and the system is designed so that a stolen ticket alone is not sufficient |
| TB-8 | The VPS → the backup destination | HTTPS | Encryption at rest, a separate account, the verification step |
| TB-9 | The operator → the database (psql) | SQL | Break-glass credentials; every session is logged |

**The invariant:** the browser and the Telegram client are untrusted. Every decision that matters
is made by the API against the database.

## 4. STRIDE analysis

### 4.1 Spoofing

| # | Threat | Scenario | Control | Residual risk |
|---|---|---|---|---|
| S1 | **Ticket screenshot reuse** | An attacker photographs the owner's ticket and presents it to exit with their own motorcycle. | The backend checks the live session state; the ticket authorizes exactly one exit; the guard must physically compare the plate. | A determined attacker who also has the owner's motorcycle can exit. Accepted — the same as a stolen paper ticket. |
| S2 | **Claim token theft from the monitor** | An attacker photographs the entry QR and claims the session before the owner. | The claim activates the session and issues the ticket to the attacker; the owner then has no ticket. At the exit the guard checks the plate against the ticket — the attacker's ticket is for the owner's plate. | **Real risk.** Mitigation: the guard is present at the monitor and can reissue; the physical plate check is the control. A stolen *e-ticket* (rather than a claim) is a stronger attack than a stolen *claim*. |
| S3 | **Token guessing** | An attacker brute-forces a claim token or a ticket reference. | 256 bits for the claim token (infeasible); ~40 bits for the public reference (rate-limited, and it does not complete an exit by itself). | Low. |
| S4 | **Credential stuffing** | The attacker reuses a leaked password. | Argon2id, the rate limit, the uniform error message, the audit trail. | Medium — mitigated by the rate limit. |
| S5 | **Refresh-token theft and replay** | The attacker steals the refresh cookie and replays it. | Rotation with reuse detection; the whole family is revoked on a replay. | Low. |
| S6 | **Telegram webhook forgery** | The attacker posts a crafted update. | The secret token is required on every delivery. | Low. |
| S7 | **Session fixation** | The attacker plants a session id. | A fresh session id is issued on every login; the old one is invalidated. | Low. |
| S8 | **Impersonating a guard** | The attacker signs in with a shared guard account. | Individual accounts; every action is attributed; the deactivation is immediate. | Procedural — the training forbids shared logins. |

### 4.2 Tampering

| # | Threat | Scenario | Control | Residual risk |
|---|---|---|---|---|
| T1 | **Client-supplied status or fee** | The attacker posts `status: COMPLETED` or a fee of 0. | The DTOs are strict; the status, the site, the fee, and the timestamps are server-derived. | Low. |
| T2 | **Client-supplied site id** | The attacker targets another site. | The scope check on every site-scoped request. | Low. |
| T3 | **Modifying a payment row** | The attacker reduces a recorded amount. | No client-facing update route; the corrections are `VOIDED` with an audit reason. | Low. |
| T4 | **Deleting an audit row** | The attacker erases the evidence. | No delete route; the database role has only `SELECT` and `INSERT` on `audit_logs`. | Low. |
| T5 | **Replaying a claim** | The attacker reuses a claim token after a successful claim. | `claimed_at` + the ticket's unique constraint; the second attempt is 410. | Low. |
| T6 | **Editing a pricing policy** | The attacker changes the price after the fact. | The policies are immutable; a session keeps its version; the fee is snapshotted. | Low. |
| T7 | **A stale price re-pricing history** | A policy change alters what yesterday's sessions cost. | The session stores the policy id; the snapshot is written at exit. | Low. |
| T8 | **A double charge** | Two payments are recorded for one session. | The partial unique index on `payments(session_id) WHERE status='PAID'`. | Low. |
| T9 | **An SQL injection** | The attacker injects through the plate or the reference. | The Zod format validation + Prisma's parameterisation; no raw SQL in the request path. | Low. |
| T10 | **A mass assignment of the role** | The attacker sets `role: super_admin` in a body. | The strict DTOs; `role` is writable only through the super-admin grant endpoint. | Low. |

### 4.3 Repudiation

| # | Threat | Scenario | Control | Residual risk |
|---|---|---|---|---|
| R1 | **"I did not void that payment."** | A guard disputes a recorded action. | The audit row records the actor, the request id, the amount, and the reason. | Low. |
| R2 | **"That session was never created."** | A session appears without a creation record. | The audit row is written in the same transaction. | Low. |
| R3 | **The clock is wrong, so the times are wrong.** | A guard is accused of an action at the wrong time. | The server clock is the only source; a drift alert compares it with the database clock. | Low. |
| R4 | **A shared account makes attribution meaningless.** | Two guards use one login. | Individual accounts; the deactivation is immediate; the training forbids sharing. | Procedural. |
| R5 | **A platform action is unattributed.** | A super admin changes something. | Every platform action is audited with the actor. | Low. |

### 4.4 Information disclosure

| # | Threat | Scenario | Control | Residual risk |
|---|---|---|---|---|
| I1 | **Plate enumeration** | The attacker lists plates through a session list. | The list is scope-bounded; the owner report omits the plate; the per-plate view is super-admin only, masked, and audited. | Low. |
| I2 | **A token in a log** | The attacker reads the logs. | The redaction interceptor; the tokens are hashed at rest. | Low. |
| I3 | **A token in the browser** | The attacker reads the storage. | HTTP-only cookies; no token in `localStorage`; `Cache-Control: no-store`; the ticket page's referrer policy. | Low. |
| I4 | **A token in the URL** | The token leaks through the referrer or the history. | The token is moved into a POST body as soon as the page loads; `Referrer-Policy: no-referrer`; the fragment is used. | Low. |
| I5 | **The owner sees another owner's data** | A query bug returns the wrong rows. | The scope is applied in the query; a per-site breakdown only. | Low. |
| I6 | **A stack trace or SQL in a response** | The attacker probes for errors. | The consistent error envelope; the full error is logged server-side only. | Low. |
| I7 | **A backup leaks the plates** | The backup bucket is compromised. | The backup is encrypted at rest in a separate account; the access is logged; the plates are redacted after 90 days. | Medium — the backups hold the last 90 days of plates. |
| I8 | **The pepper leaks** | The attacker reverses the digest to recover the plates. | The pepper is an environment secret, never logged, never in the response. | Low — critical impact if it happens. |
| I9 | **The Telegram bot token leaks** | The attacker impersonates the bot. | The token is only in the environment; the logger redacts it; the client bundle is scanned. | Low. |
| I10 | **An error reveals whether a ticket exists** | The attacker enumerates the references. | The `UNKNOWN` verdict returns no facts; the responses for an unknown and an out-of-scope resource are identical. | Low. |

### 4.5 Denial of service

| # | Threat | Scenario | Control | Residual risk |
|---|---|---|---|---|
| D1 | **A claim flood** | The attacker hammers the public claim endpoint. | The per-IP and per-session rate limits; the claim is a cheap indexed lookup. | Low. |
| D2 | **A login flood** | The attacker burns the guard's account access. | The rate limit; the lockout is per-email, not a global account lock. | Low. |
| D3 | **An expensive report** | The attacker requests a 10-year range. | The range is bounded to 366 days; the queries are indexed; the timeout applies. | Low. |
| D4 | **A huge export** | The attacker requests the whole audit log repeatedly. | The 100 000-row bound; the rate limit; the export is audited. | Low. |
| D5 | **The database fills up** | The audit table grows without bound. | The retention job; the monitoring on the disk usage. | Low. |
| D6 | **A site loses the internet** | The central backend is unreachable. | **Not mitigated in the MVP** — see the residual risk note below. | **High** — mitigated in Phase 6 by the local parking service. |
| D7 | **A dependency has a remote exploit** | A vulnerable package is exploited. | The dependency audit fails CI; the base images are pinned by digest; the updates are deliberate. | Medium. |

### 4.6 Elevation of privilege

| # | Threat | Scenario | Control | Residual risk |
|---|---|---|---|---|
| E1 | **A guard reaches another site** | The guard changes the site id. | The scope check on every site-scoped request. | Low. |
| E2 | **A guard becomes an owner** | The guard self-grants. | The fine-grained check; the per-user `REVOKE` beats the role grant; the grant endpoint is super-admin only. | Low. |
| E3 | **A bypass branch in the code** | Somebody writes `if (isSuperAdmin) return allow`. | The CI check greps for the bypass patterns outside the authorization module; the route audit; the code review. | Low. |
| E4 | **A route with no metadata** | A new route is added without a permission. | The deny-by-default rule; the route audit fails the build. | Low. |
| E5 | **A stale privilege after revocation** | A fired guard keeps access until the token expires. | The `authzVersion` bump; the eager cache invalidation. | Low. |
| E6 | **The owner grants themselves a super admin** | The owner edits their own role. | The owner-facing endpoints have no role-writing capability. | Low. |
| E7 | **A public route that should not be** | Somebody marks a route `@Public()`. | The allowlist in the route audit; the threat model review. | Low. |
| E8 | **A manager becomes an owner** | The `manager` site role grants too much. | The manager grants are per-user, with an explicit site list; the scope is the union of the assigned sites. | Low. |

## 5. The abuse cases

These are the realistic abuse scenarios, each with the expected system behaviour.

| # | Abuse | Expected behaviour |
|---|---|---|
| A-1 | Photograph the monitor's entry QR and claim it from home. | The claim succeeds (the token is valid for 5 minutes). The attacker holds the ticket; the guard's physical plate check at the exit is the control. The guard can reissue the QR if the owner is standing there. |
| A-2 | Photograph the owner's e-ticket and share it with a friend. | The friend's motorcycle's plate will not match; the guard sees `PLATE_MISMATCH` and the exit is blocked. A manual review is required. |
| A-3 | Photograph the owner's e-ticket and ride out on the owner's motorcycle. | The exit succeeds — the same as a stolen paper ticket. This is a **physical security** limit, documented in the guard training. |
| A-4 | Replay the owner's e-ticket after the owner has left. | The session is `COMPLETED`; the verdict is `ALREADY_COMPLETED`; the exit is blocked. |
| A-5 | Guess ticket references. | ~40 bits, rate-limited to 60/minute per guard. The reference alone does not complete an exit. |
| A-6 | Enumerate the sites and sessions. | Every out-of-scope request is 403 with an identical body. |
| A-7 | A guard steals another guard's session cookie. | The action is attributed to the thief's account; the victim reports it; the session is revoked by the suspension. |
| A-8 | A guard exempts fees for their friends. | The exemption requires the permission and a reason; the reason is stored; the exempt total is reported as leakage to the owner and the super admin. |
| A-9 | A guard records a payment they did not take. | The payment is attributed to the guard; the owner sees it; the reason is stored. |
| A-10 | A guard voids a payment to hide their mistake. | The void is audited; `VOIDED` subtracts from the revenue and is reported separately. |
| A-11 | The owner reads another owner's revenue. | 403 with an identical body. |
| A-12 | A super admin exports the audit log to exfiltrate the plates. | The export is bounded, rate-limited, audited, and the plates are redacted after 90 days. The per-plate view is masked. |
| A-13 | A bot posts a crafted webhook update. | The secret token is required; the response is 401. |
| A-14 | An attacker floods the claim endpoint to exhaust the database. | The rate limit; the claim is an indexed lookup. |
| A-15 | The site loses the internet. | **The MVP cannot operate.** The outage procedure in `docs/incident-response.md` applies. This is a known, accepted limitation (ADR-002) with a designed answer in Phase 6 (ADR-003). |

## 6. The `@Public()` allowlist

Only these routes may be marked `@Public()`. The route audit test fails the build when a route is
marked public without appearing here, and any change to this list is a security-relevant diff that
must be reviewed.

| Method | Path | Why it is public | What protects it |
|---|---|---|---|
| POST | `/api/v1/auth/login` | There is no session yet. | Argon2id, the rate limit (per IP and per email), the uniform error message |
| POST | `/api/v1/auth/refresh` | The access token is expired by definition. | The refresh token is a secret, is rotated, and has reuse detection |
| POST | `/api/v1/entry-claims/claim` | The claim token **is** the credential. | 256 bits of entropy, a single use, a 5-minute TTL, the per-IP and per-session rate limits, a strict DTO |
| POST | `/api/v1/telegram/webhook` | The Telegram secret token is the credential. | The secret token, the update-id dedupe, the body size limit |
| GET | `/api/v1/health/live` | A liveness probe. | Nothing sensitive is returned |
| GET | `/api/v1/health/ready` | A readiness probe. | Only the status, the version, and the database state — never a connection string |

**Nothing else.** In particular: the ticket retrieval by reference returns only the safe public
payload, but it is still behind the `ticket.claim` permission check and is rate-limited.

## 7. The residual risks accepted for the MVP

| # | Risk | Why it is accepted | The mitigation path |
|---|---|---|---|
| R-1 | A stolen e-ticket lets the thief exit on the owner's motorcycle. | The same as a stolen paper ticket; a physical-security limit, not a software one. | The guard training; a future photo/identity check. |
| R-2 | The site cannot operate during an internet outage. | The MVP is online-first by decision (ADR-002). | The local parking service in Phase 6 (ADR-003). The outage procedure is in `docs/incident-response.md`. |
| R-3 | A guard with a `manager` site role can change the pricing. | The owner trusts their managers; the role is assigned deliberately and the change is audited. | The owner can revoke the assignment immediately. |
| R-4 | The backups contain the last 90 days of readable plates. | The plates are needed operationally. | The encryption, the separate account, the redaction job, the restore drill. |
| R-5 | A compromised guard account can exempt fees and void payments. | The guard needs the operational ability. | The reason is mandatory, the actions are audited, the owner and the super admin see the leakage figures, the revocation is immediate. |
| R-6 | The claim token is stored in Telegram's servers when the owner uses a deep link. | Telegram requires the token to route the claim. | The token is single-use and expires in 5 minutes; the ticket is the durable artefact. |
| R-7 | No second factor for the super admin. | The MVP scope. | A second factor before production (the open question in `features/authentication/`). |

## 8. The security review checklist

Before the production launch, and after any significant change:

- [ ] The route audit passes (no route without metadata; the public allowlist unchanged).
- [ ] The dependency audit passes.
- [ ] The secret scanner passes over the repository and the images.
- [ ] The client bundle contains no server secret.
- [ ] The authorization tests pass at the API boundary for every role.
- [ ] The rate limits are configured and verified.
- [ ] The error responses leak nothing.
- [ ] The logs contain no token, password, cookie, or raw plate.
- [ ] The backup has been restored successfully at least once in the last 30 days.
- [ ] The consistency checks have run clean for the last 7 days.
- [ ] The `@Public()` allowlist is unchanged, or the change is reviewed and the threat model is
      updated.
- [ ] The privacy notice and the retention policy are published.

## 9. Related

* `specs/security/access-control-matrix.md` — the role × permission × scope table.
* `specs/architecture/rbac-design.md` — the enforcement mechanism.
* `specs/features/security/` — the cross-cutting security requirements.
* `specs/features/entry-qr-claim/` · `specs/features/guest-ticket/` — the token lifecycles.
* `docs/incident-response.md` — the operational procedures.
