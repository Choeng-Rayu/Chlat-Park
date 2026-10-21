# Chlat-Park — Test Matrix

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`strategy.md`](./strategy.md) · [`../features/*/acceptance.feature`](../features/)

---

## 1. How to read this matrix

Each row maps a **requirement ID** to the test that proves it and the layer the test lives in.

| Layer | Code | Meaning |
|---|---|---|
| U | Unit | A pure function; no database |
| I | Integration | A real database, a real transaction |
| A | API boundary | A real HTTP request with a real session |
| E | E2E | A browser against the real API |
| S | Static | A lint rule, a CI check, a script |

**A requirement with no row is not done.** The `check:acceptance-mapping` script enforces the
mapping between the `acceptance.feature` scenarios and the tagged tests.

## 2. The per-requirement mapping

### 2.1 Authentication — `AUTH-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| AUTH-001 | A | `auth.e2e-spec.ts` — a valid login returns 200 and the audit row exists | |
| AUTH-002 | U | `password.service.spec.ts` — the hash verifies, the salt is embedded, two hashes differ | The OWASP parameter baseline is asserted |
| AUTH-003 | A | `auth.e2e-spec.ts` — no password or hash in the response or the logs | |
| AUTH-004 | A | `auth.e2e-spec.ts` — the cookie attributes and the 15-minute expiry | |
| AUTH-005 | I | `auth.e2e-spec.ts` — the rotation, the revocation, and the reuse detection | The family revocation is asserted |
| AUTH-006 | I | `auth.e2e-spec.ts` — the `auth.login` audit row with the IP and the user agent | |
| AUTH-007 | A | `auth.e2e-spec.ts` — the identical body for an unknown email and a wrong password | The bodies are compared byte for byte |
| AUTH-008 | A | `auth-abuse.e2e-spec.ts` — the 429 and the `Retry-After` | |
| AUTH-009 | I | `auth.e2e-spec.ts` — the revocation, the cookie clearing, the audit row | |
| AUTH-010 | A | `auth.e2e-spec.ts` — a suspended user's valid token is rejected | The rejection is immediate, not at the token expiry |
| AUTH-011 | A | `auth-abuse.e2e-spec.ts` — the 428 `AUTH_REAUTH_REQUIRED` | |
| AUTH-012 | U | `auth.service.spec.ts` — the role-capped lifetime | The server cap ignores the client request |
| AUTH-013 | A | `auth-abuse.e2e-spec.ts` — the missing and the foreign CSRF token | |
| AUTH-014 | A | `auth.e2e-spec.ts` — the two distinguishable 401 codes | |

### 2.2 Authorization — `RBAC-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| RBAC-001 | U | `permissions.spec.ts` — the catalogue is well-formed and the key union is exact | |
| RBAC-002 | A | `authorization.e2e-spec.ts` — every role is denied what it does not hold | |
| RBAC-003 | S | `route-audit.spec.ts` — a route without metadata fails the build | The failing route is named |
| RBAC-004 | S | `route-audit.spec.ts` — a public route outside the allowlist fails the build | |
| RBAC-005 | I | `scope-resolver.service.spec.ts` — the target-site resolution order | |
| RBAC-006 | U | `scope-resolver.service.spec.ts` — the platform / owned / assigned / self resolution and the union | |
| RBAC-007 | A | `authorization.e2e-spec.ts` — the cross-site 403 | |
| RBAC-008 | S | The CI grep for the bypass patterns + `authorization.e2e-spec.ts` | A super admin without the permission is denied |
| RBAC-009 | U | `authorization.service.spec.ts` — the role + grant − revoke computation | |
| RBAC-010 | U | `authorization.service.spec.ts` — the cache hit avoids the query | |
| RBAC-011 | I | `authorization-revocation.e2e-spec.ts` — the next request is denied | No sleep, no cache wait |
| RBAC-012 | A | `authorization.e2e-spec.ts` — the suspension | |
| RBAC-013 | I | `authorization.e2e-spec.ts` — the denial audit row | |
| RBAC-014 | U | `authorization.service.spec.ts` — the expired grant is absent | |
| RBAC-015 | A | `authorization.e2e-spec.ts` — the exemption without a reason is rejected | |
| RBAC-016 | A | `authorization.e2e-spec.ts` — the identical responses | The bodies are compared |

### 2.3 Parking sites — `PARK-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| PARK-001 | A | `parking-sites.e2e-spec.ts` — a request with no resolvable site is rejected | |
| PARK-002 | A | `parking-sites.e2e-spec.ts` — the cross-site 403 | |
| PARK-003 | A | `parking-sites.e2e-spec.ts` — the owner comes from the actor | The body's `ownerId` is ignored |
| PARK-004 | U | `site-settings.spec.ts` — the name, the address, the timezone, the currency | The invalid IANA zone is rejected |
| PARK-005 | I | `parking-sites.e2e-spec.ts` — the site's currency on the payment | |
| PARK-006 | U | `site-settings.spec.ts` — the accepted methods | |
| PARK-007 | U | `site-settings.spec.ts` — the TTL bounds and the default | |
| PARK-008 | I | `parking-sites.e2e-spec.ts` — the duplicate active session at one site, and the same plate at two sites | |
| PARK-009 | A | `parking-sites.e2e-spec.ts` — the in-scope list and the pagination | |
| PARK-010 | I | `parking-sites.e2e-spec.ts` — the deactivation, the retained history | |

### 2.4 Parking session — `SESSION-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| SESSION-001 | I | `parking-session.e2e-spec.ts` — the created session's fields | |
| SESSION-002 | I | `parking-session.e2e-spec.ts` — the rollback when the entry claim fails | The insert is forced to fail |
| SESSION-003 | A | `parking-session.e2e-spec.ts` — the rejected status / entryAt / fee body fields | |
| SESSION-004 | U | `plate-normalizer.spec.ts` + an I test — the original and the normalized plate | |
| SESSION-005 | U | `plate-digest.service.spec.ts` — the HMAC, the stability, the difference | |
| SESSION-006 | I | `parking-session.e2e-spec.ts` — `entry_at` is null while pending, set at the activation | |
| SESSION-007 | U | `pricing.service.spec.ts` — the window is `[entry_at, exit_at]` | |
| SESSION-008 | U | `session-state-machine.spec.ts` — every (from, to) pair | 100 % of the pairs |
| SESSION-009 | I | `parking-session.e2e-spec.ts` — the manual activation and the cancellation, and the audit rows | |
| SESSION-010 | I | `parking-session.e2e-spec.ts` — the cancellation revokes the claim | |
| SESSION-011 | A | `parking-session.e2e-spec.ts` — the filtered, paginated, scoped list | |
| SESSION-012 | I | `parking-session.e2e-spec.ts` — the concurrent completion; the second is 409 | |
| SESSION-013 | I | `parking-session.e2e-spec.ts` — the policy version is recorded and reused | |
| SESSION-014 | I | `parking-session.e2e-spec.ts` — the fee snapshot at the completion | |

### 2.5 Entry claim — `CLAIM-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| CLAIM-001 | U | `claim-token.service.spec.ts` — 1000 distinct tokens, 43+ chars, no embedded id | |
| CLAIM-002 | I | `entry-claim.e2e-spec.ts` — only the hash is stored; the raw is returned once | |
| CLAIM-003 | I | `entry-claim.e2e-spec.ts` — the token is absent from the logs and the audit rows | The captured logs are scanned |
| CLAIM-004 | U | `claim-token.service.spec.ts` — the expiry is the issue time + the site TTL | |
| CLAIM-005 | A | `entry-claim.e2e-spec.ts` — the 410 for the claimed, the expired, and the revoked | |
| CLAIM-006 | A | `entry-claim.e2e-spec.ts` — the 404 for an unknown token | |
| CLAIM-007 | I | `entry-claim.e2e-spec.ts` — the unique constraint on `tickets.session_id` | |
| CLAIM-008 | I | `entry-claim.e2e-spec.ts` — the two concurrent claims | `Promise.all` against a real database |
| CLAIM-009 | I | `entry-claim.e2e-spec.ts` — the activation and `entry_at` in the claim transaction | |
| CLAIM-010 | A | `entry-claim.e2e-spec.ts` — the 429 | |
| CLAIM-011 | I | `entry-claim.e2e-spec.ts` — the reissue revokes the old token | |
| CLAIM-012 | I | `entry-claim.e2e-spec.ts` — the cancellation revokes the claim | |
| CLAIM-013 | U | `entry-claim.e2e-spec.ts` — the exact key set of the claim response | |
| CLAIM-014 | E | `guard-entry.spec.ts` — the decoded QR payload | The payload is decoded and checked |

### 2.6 Guest ticket — `TICKET-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| TICKET-001 | I | `tickets.e2e-spec.ts` — one ticket per session | |
| TICKET-002 | U | `ticket-reference.service.spec.ts` — the uniqueness, the length, the alphabet | 1000 references |
| TICKET-003 | A | `tickets.e2e-spec.ts` — the reference lookup does not expose the token | |
| TICKET-004 | U | `tickets.e2e-spec.ts` — the exact key set of the payload | |
| TICKET-005 | E | `ticket-page.spec.ts` — the 360×640 viewport, no scrolling | |
| TICKET-006 | E | `ticket-page.spec.ts` — the storage hygiene | localStorage, sessionStorage, IndexedDB, the SW cache |
| TICKET-007 | A | `exit.e2e-spec.ts` — the revoked and the expired verdicts | |
| TICKET-008 | A | `tickets.e2e-spec.ts` — the reason is mandatory | |
| TICKET-009 | A | `tickets.e2e-spec.ts` — the link by reference alone fails; the link by token succeeds | |
| TICKET-010 | I | `tickets.e2e-spec.ts` — the session and the payments are unchanged after the link | |
| TICKET-011 | A | `tickets.e2e-spec.ts` — the account list is scoped and token-free | |
| TICKET-012 | A | `exit.e2e-spec.ts` — the `ALREADY_COMPLETED` verdict for a spent ticket | |

### 2.7 Exit verification — `EXIT-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| EXIT-001 | A | `exit.e2e-spec.ts` — the verification by token and by reference | |
| EXIT-002 | U | `verification.service.spec.ts` — one case per verdict, and the precedence | |
| EXIT-003 | I | `exit.e2e-spec.ts` — the verdict reflects the live state, not a cached one | The state is changed between two calls |
| EXIT-004 | U | `verification.service.spec.ts` — the facts are all present | |
| EXIT-005 | A | `exit.e2e-spec.ts` — the plate mismatch | |
| EXIT-006 | I | `exit.e2e-spec.ts` — the transactional completion | |
| EXIT-007 | I | `exit.e2e-spec.ts` — the second completion is 409 | |
| EXIT-008 | I | `exit.e2e-spec.ts` — the two concurrent completions | One 200, one 409, one audit row |
| EXIT-009 | I | `exit.e2e-spec.ts` — the unpaid, the pending, and the failed payments block the exit | |
| EXIT-010 | A | `exit.e2e-spec.ts` — the exemption without the permission is 403 | |
| EXIT-011 | I | `exit.e2e-spec.ts` — the review case, the reason, the state change | |
| EXIT-012 | A | `exit.e2e-spec.ts` — the resolution requires the permission and a reason | |
| EXIT-013 | A | `exit.e2e-spec.ts` — the plate search, and the cross-site rejection | |
| EXIT-014 | I | `exit.e2e-spec.ts` — the fee snapshot at the completion | |
| EXIT-015 | I | `exit.e2e-spec.ts` — the audit rows for the verifications | |
| EXIT-016 | A | `exit.e2e-spec.ts` — the rate limits | |

### 2.8 Pricing and payment — `PRICE-*`, `PAY-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| PRICE-001 | I | `pricing.e2e-spec.ts` — the version monotonicity | |
| PRICE-002 | U | `pricing.service.spec.ts` — the per-rule-type configuration validation | |
| PRICE-003 | I | `pricing.e2e-spec.ts` — the immutability | |
| PRICE-004 | I | `pricing.e2e-spec.ts` — the session keeps its policy version | |
| PRICE-005 | U | `pricing.service.spec.ts` — the no-`entry_at` case is 409 | |
| PRICE-006 | U | `pricing.service.spec.ts` — the rounding, the zero, the negative clamp | |
| PRICE-007 | U | `pricing.service.spec.ts` — the hourly rule, the grace period, the cap, the rounding up | |
| PRICE-008 | U | `pricing.service.spec.ts` — the tiered band selection | |
| PRICE-009 | U | `pricing.service.spec.ts` — the preview equals the snapshot | |
| PRICE-010 | I | `exit.e2e-spec.ts` — the snapshot at the completion | |
| PRICE-011 | A | `payments.e2e-spec.ts` — the client-supplied currency is rejected | |
| PRICE-012 | U | `pricing.service.spec.ts` — the future-dated policy is not selected | |
| PAY-001 | I | `payments.e2e-spec.ts` — the integer minor units; no float column | |
| PAY-002 | A | `payments.e2e-spec.ts` — the status and the method validation | |
| PAY-003 | A | `payments.e2e-spec.ts` — the permission, the reason, the audit row | |
| PAY-004 | I | `payments.e2e-spec.ts` — the confirming guard and the time | |
| PAY-005 | I | `payments.e2e-spec.ts` — the second `PAID` is 409; 10 concurrent attempts → one | |
| PAY-006 | A | `payments.e2e-spec.ts` — the permission, the reason, the actor | |
| PAY-007 | I | `payments.e2e-spec.ts` — the void keeps the row and the amount | |
| PAY-008 | I | `reports.e2e-spec.ts` — the voided amount is excluded from the collected | |
| PAY-009 | I | `exit.e2e-spec.ts` — the pending and the failed do not satisfy | |
| PAY-010 | I | `payments.e2e-spec.ts` — the consistency check finds no mismatch | A deliberately corrupted row is detected |
| PAY-011 | U | `payments.service.spec.ts` — the satisfaction rules | |
| PAY-012 | I | `payments.e2e-spec.ts` — a receipt image creates no payment | |

### 2.9 Owner management — `OWN-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| OWN-001 | I | `owner.e2e-spec.ts` — the profile and the owned sites | |
| OWN-002 | A | `owner.e2e-spec.ts` — the cross-owner rejections | The site, the report, and the audit log |
| OWN-003 | I | `owner.e2e-spec.ts` — the invite creates the user, the profile, and the assignment | No password is returned or set |
| OWN-004 | I | `owner.e2e-spec.ts` — the multiple assignments with different site roles | |
| OWN-005 | A | `owner.e2e-spec.ts` — the immediate revocation | The next request, no wait |
| OWN-006 | I | `pricing.e2e-spec.ts` — the effective version is immutable | |
| OWN-007 | A | `reports.e2e-spec.ts` — the filters and the scope | |
| OWN-008 | I | `reports.e2e-spec.ts` — the four money figures are separate | |
| OWN-009 | A | `owner.e2e-spec.ts` — the site audit view is read-only | |
| OWN-010 | I | `owner.e2e-spec.ts` — the suspension blocks the access, keeps the data | |
| OWN-011 | U | `reports.e2e-spec.ts` — the report DTO has no plate field | |
| OWN-012 | A | `owner.e2e-spec.ts` — the grant and the role escalation are rejected | |

### 2.10 Admin console — `ADMIN-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| ADMIN-001 | I | `admin-revenue.e2e-spec.ts` — the four figures | |
| ADMIN-002 | I | `admin-revenue.e2e-spec.ts` — the exempt and the voided are excluded from the collected | |
| ADMIN-003 | I | `admin-revenue.e2e-spec.ts` — the uncollected at close | |
| ADMIN-004 | U | `admin-adoption.e2e-spec.ts` — the distinct guests; no digest in the response | |
| ADMIN-005 | I | `admin-adoption.e2e-spec.ts` — the registered count | |
| ADMIN-006 | I | `admin-adoption.e2e-spec.ts` — the funnel and the rates | Hand-computed fixtures |
| ADMIN-007 | I | `admin-adoption.e2e-spec.ts` — the repeat rate | |
| ADMIN-008 | I | `admin-adoption.e2e-spec.ts` — the split and the breakdowns | |
| ADMIN-009 | I | `admin-adoption.e2e-spec.ts` — the monthly trend | |
| ADMIN-010 | U | `admin-adoption.e2e-spec.ts` — no per-plate rows; a bounded size | |
| ADMIN-011 | A | `admin.e2e-spec.ts` — the two permissions, the rate limit, the audit row, the masked plate | |
| ADMIN-012 | I | `admin.e2e-spec.ts` — the platform actions are audited | |
| ADMIN-013 | A | `admin.e2e-spec.ts` — the export bound, the rate limit, the audit rows | |
| ADMIN-014 | A | `admin.e2e-spec.ts` — the over-long range is rejected | |

### 2.11 Audit — `AUDIT-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| AUDIT-001 | I | `audit.e2e-spec.ts` — the action catalogue is exercised | Every action in the catalogue |
| AUDIT-002 | I | `audit.e2e-spec.ts` — the rollback when the audit insert fails | |
| AUDIT-003 | I | `audit.e2e-spec.ts` — the row's fields | |
| AUDIT-004 | S | `audit.e2e-spec.ts` — no mutating route; the direct DELETE is 405 | The database role is checked too |
| AUDIT-005 | A | `audit.e2e-spec.ts` — the scope | |
| AUDIT-006 | A | `audit.e2e-spec.ts` — the filters and the pagination | |
| AUDIT-007 | A | `audit.e2e-spec.ts` — the export bound and the audit row | |
| AUDIT-008 | I | `audit.e2e-spec.ts` — the forbidden keys are absent | The captured rows are scanned |
| AUDIT-009 | I | `audit.e2e-spec.ts` — the digest, not the plate | |
| AUDIT-010 | I | `audit.e2e-spec.ts` — the denial row | |
| AUDIT-011 | A | `audit.e2e-spec.ts` — the reason is mandatory | |
| AUDIT-012 | I | `retention.spec.ts` — only the expired rows are deleted, in batches | |
| AUDIT-013 | I | `audit.e2e-spec.ts` — the audit failure rolls the business change back | |
| AUDIT-014 | I | `audit.e2e-spec.ts` — the request id matches the response header | |

### 2.12 Security — `SEC-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| SEC-001 | S | `security.e2e-spec.ts` — the HSTS header; the HTTP redirect | |
| SEC-002 | S | The proxy configuration test | |
| SEC-003 | A | `security.e2e-spec.ts` — the unknown body field is rejected | |
| SEC-004 | A | `security.e2e-spec.ts` — the cookie attributes | |
| SEC-005 | A | `security.e2e-spec.ts` — the missing and the foreign CSRF token | |
| SEC-006 | A | `security.e2e-spec.ts` — the foreign origin gets no allow-origin | |
| SEC-007 | S | `security.e2e-spec.ts` — the CSP header; the ESLint ban on `dangerouslySetInnerHTML` | |
| SEC-008 | A | `security.e2e-spec.ts` — each route's budget | |
| SEC-009 | A | `security.e2e-spec.ts` — the request id in the response, the log, and the audit row | |
| SEC-010 | S | The CI secret scan | |
| SEC-011 | S | The CI bundle scan and the `NEXT_PUBLIC_*` name check | |
| SEC-012 | I | `security.e2e-spec.ts` — the log and the error scan | |
| SEC-013 | A | `security.e2e-spec.ts` — the forced database error | |
| SEC-014 | S | The infrastructure check — the database is not publicly reachable | |
| SEC-015 | S | The CI dependency audit and the digest pinning check | |
| SEC-016 | A | `security.e2e-spec.ts` — the metacharacter plate | The table still exists afterwards |
| SEC-017 | S | The route audit against the reviewed allowlist | |
| SEC-018 | A | `security.e2e-spec.ts` — the `text/plain` body is 415 | |

### 2.13 Internationalization — `I18N-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| I18N-001 | E | `guard-khmer.spec.ts` — the Khmer rendering | |
| I18N-002 | S | `check-parity.ts` — the key pattern | |
| I18N-003 | S | `check-parity.ts` — the key set equality | A fixture with a removed key fails the check |
| I18N-004 | U | `index.spec.ts` — the English fallback and the placeholder | |
| I18N-005 | A | `security.e2e-spec.ts` — the localised message, the stable code | |
| I18N-006 | E | `locale.spec.ts` — the resolution order | |
| I18N-007 | E | `format.spec.ts` — the site timezone | |
| I18N-008 | U | `format.spec.ts` — the minor-unit conversion | |
| I18N-009 | E | `locale.spec.ts` — the identifiers are verbatim | |
| I18N-010 | E | `guard-khmer.spec.ts` — the label plus the non-colour marker | |

### 2.14 Telegram (P1) — `TG-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| TG-001 | I | `telegram.e2e-spec.ts` — the web and the bot produce the same result | The parity test |
| TG-002 | A | `telegram.e2e-spec.ts` — the invalid secret is 401 | |
| TG-003 | I | `telegram.e2e-spec.ts` — the duplicate delivery | 10 times, one ticket, one message |
| TG-004 | S | `telegram.e2e-spec.ts` + the bundle scan | |
| TG-005 | I | `telegram.e2e-spec.ts` — the same claim errors as the web | |
| TG-006 | I | `telegram.e2e-spec.ts` — the message contents | |
| TG-007 | E | `telegram.e2e-spec.ts` — the QR image payload | |
| TG-008 | A | `telegram.e2e-spec.ts` — the unlinked identity sees nothing | |
| TG-009 | I | `telegram.e2e-spec.ts` — the outage message | |
| TG-010 | E | `telegram.e2e-spec.ts` — the language selection | |
| TG-011 | A | `telegram.e2e-spec.ts` — the malformed body is 400 | |
| TG-012 | I | `telegram.e2e-spec.ts` — the channel in the audit row | |

### 2.15 Offline sync (deferred) — `SYNC-*`

| ID | Layer | Test | Notes |
|---|---|---|---|
| SYNC-001 | I | The event schema test — the required fields | Phase 6 |
| SYNC-002 | A | The unknown authority is 401 | Phase 6 |
| SYNC-003 | I | The duplicate event | Phase 6 |
| SYNC-004 | I | The invalid transition is rejected | Phase 6 |
| SYNC-005 | I | The transactional apply | Phase 6 |
| SYNC-006 | A | The per-event statuses | Phase 6 |
| SYNC-007 | I | The conflict is flagged, not applied | Phase 6 |
| SYNC-008 | I | The replayed batch | Phase 6 |
| SYNC-009 | I | The outbox is written with the state change | Phase 6 |
| SYNC-010 | I | The restart and recovery | Phase 6 — a real kill, not a mock |
| SYNC-011 | U | The signature verification and the key rotation | Phase 6 |
| SYNC-012 | E | The UI states the limitation | Phase 6 |

## 3. The matrix from the plan's §17, expanded

The plan's minimum test matrix, mapped to the requirement IDs and to the test files.

| Plan area | The essential tests | The requirement IDs | The test file |
|---|---|---|---|
| Plate input | Empty, whitespace, the Khmer/Latin formats, the correction, the normalization | SESSION-004, PARK-008 | `plate-normalizer.spec.ts`, `parking-session.e2e-spec.ts` |
| Session creation | The authorized guard, the wrong site, the duplicate-active policy, the database failure | SESSION-001, SESSION-002, PARK-002, PARK-008 | `parking-session.e2e-spec.ts` |
| Entry QR | Valid, expired, cancelled, unknown, the brute-force limit, reused | CLAIM-005, CLAIM-006, CLAIM-010, CLAIM-008 | `entry-claim.e2e-spec.ts` |
| Ticket issue | Exactly one, the safe payload, the guest flow without an account | TICKET-001, TICKET-004, TICKET-009 | `tickets.e2e-spec.ts` |
| Exit verification | Valid, unknown, revoked, completed, the plate mismatch | EXIT-002, EXIT-005, EXIT-007 | `exit.e2e-spec.ts` |
| Concurrency | Two guards exiting at once; only one succeeds | EXIT-008, SESSION-012, CLAIM-008, PAY-005 | `exit.e2e-spec.ts`, `entry-claim.e2e-spec.ts`, `payments.e2e-spec.ts` |
| Payment | The correct fee, the rounding, unpaid, pending, failed, paid, the exemption with a reason | PRICE-006, PAY-002, PAY-006, PAY-009, PAY-011 | `payments.e2e-spec.ts` |
| Authorization | The guard cannot reach another site; the owner cannot reach another owner's data | RBAC-002, RBAC-007, OWN-002 | `authorization.e2e-spec.ts`, `owner.e2e-spec.ts` |
| Telegram | The duplicate webhook, the invalid webhook, the backend unavailable, the unlinked user | TG-002, TG-003, TG-008, TG-009 | `telegram.e2e-spec.ts` |
| Offline | The internet loss, the local restart, the duplicate sync, the ordering, the conflict, the key rotation | SYNC-001 … SYNC-012 | Phase 6 — a real hardware test |
| Security | The token leakage, the rate limits, the input validation, the authorization bypass, the secret scanning | SEC-008, SEC-012, SEC-003, RBAC-008, SEC-010 | `security.e2e-spec.ts`, the CI checks |
| Operations | The migration failure, the backup restoration, the health checks, the deployment rollback | OPS-* | `migrations.spec.ts`, the restore drill, `docs/` |

## 4. The requirement → test coverage summary

| Prefix | Requirements | With a test row | With an acceptance scenario |
|---|---|---|---|
| `AUTH-` | 14 | 14 | 14 |
| `RBAC-` | 16 | 16 | 16 |
| `PARK-` | 10 | 10 | 10 |
| `SESSION-` | 14 | 14 | 14 |
| `CLAIM-` | 14 | 14 | 14 |
| `TICKET-` | 12 | 12 | 12 |
| `EXIT-` | 16 | 16 | 16 |
| `PRICE-` | 12 | 12 | 12 |
| `PAY-` | 12 | 12 | 12 |
| `OWN-` | 12 | 12 | 12 |
| `ADMIN-` | 14 | 14 | 14 |
| `AUDIT-` | 14 | 14 | 14 |
| `SEC-` | 18 | 18 | 18 |
| `I18N-` | 10 | 10 | 10 |
| `TG-` | 12 | 12 (P1) | 12 (P1) |
| `SYNC-` | 12 | 0 (deferred) | 12 (deferred, not MVP) |

**Total: 212 requirements** (14 + 16 + 10 + 14 + 14 + 12 + 16 + 12 + 12 + 12 + 14 + 12 + 14 +
12 + 18 + 10). Every MVP requirement has a test row and an acceptance scenario. The `SYNC-*`
requirements are deferred and therefore have no automated test in the MVP — their scenarios are
the Phase 6 acceptance criteria.

The per-prefix counts in the table above are verifiable with:

```bash
grep -hoE '^\| (AUTH|RBAC|PARK|SESSION|CLAIM|TICKET|EXIT|PRICE|PAY|OWN|ADMIN|TG|AUDIT|SYNC|SEC|I18N)-[0-9]{3} \|' \
  specs/features/*/spec.md | tr -d '| ' | sort -u | wc -l   # → 212
```

## 5. The related documents

* `specs/testing/strategy.md` — the pyramid, the tooling, and the rules.
* `specs/features/*/acceptance.feature` — the acceptance criteria.
* `specs/features/*/spec.md` — the requirement definitions.
