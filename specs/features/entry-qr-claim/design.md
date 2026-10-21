# Entry QR and Guest Claim — Design

**Status:** In progress
**Requirement IDs:** CLAIM-001 … CLAIM-014

---

## 1. Architecture

```
Guard dashboard                        apps/api
──────────────────                     ───────────────────────────────────────────
Create session  ──POST /parking-sites/:siteId/sessions──▶ ParkingSessionsService.create
        │                                                     │ BEGIN TX
        │                                                     │  INSERT parking_sessions
        │                                                     │  INSERT entry_claims (hash)
        │                                                     │  INSERT audit_logs
        │                                                     │ COMMIT
        │◀── { session, claimToken (raw, once) } ─────────────┘
        │
        ▼  renders a QR of the raw token

Owner device                           apps/api
────────────                           ───────────────────────────────────────────
Scan QR → /ticket/claim?token=…
  POST /api/v1/entry-claims/claim ────▶ EntryClaimsController.claim   (@Public())
        │                                     │  @Throttle({ perIp: 20/min, perSession: 5/min })
        │                                     │  hash the token → lookup
        │                                     │  validate: exists, not revoked, not expired, not claimed
        │                                     │  session.status === PENDING_CLAIM
        │                                     │ BEGIN TX
        │                                     │  INSERT tickets (unique session_id)
        │                                     │  UPDATE entry_claims SET claimed_at
        │                                     │  UPDATE parking_sessions SET status=ACTIVE, entry_at=now
        │                                     │  INSERT audit_logs
        │                                     │ COMMIT
        │◀── { ticket: { reference, token, … } } ─────────────┘
        ▼  renders the ticket page
```

## 2. Data model

```prisma
model EntryClaim {
  id           String   @id @default(uuid()) @db.Uuid
  sessionId    String   @db.Uuid
  claimTokenHash String @unique
  expiresAt    DateTime @db.Timestamptz(3)
  claimedAt    DateTime? @db.Timestamptz(3)
  revokedAt    DateTime? @db.Timestamptz(3)
  revokedReason String?
  issuedToGuardId String? @db.Uuid
  issuedAt     DateTime @default(now()) @db.Timestamptz(3)
  createdAt    DateTime @default(now()) @db.Timestamptz(3)

  session      ParkingSession @relation(fields: [sessionId], references: [id])

  @@index([sessionId])
  @@index([expiresAt])
}

model Ticket {
  id              String   @id @default(uuid()) @db.Uuid
  sessionId       String   @unique @db.Uuid   // ← one ticket per session (CLAIM-007)
  publicReference String   @unique
  tokenHash       String?  @unique
  plateDigest     String?
  status          TicketStatus @default(ISSUED)
  issuedAt        DateTime @default(now()) @db.Timestamptz(3)
  revokedAt       DateTime? @db.Timestamptz(3)
  revokedReason   String?
  createdAt       DateTime @default(now()) @db.Timestamptz(3)

  session         ParkingSession @relation(fields: [sessionId], references: [id])
}

enum TicketStatus { ISSUED  REVOKED  EXPIRED }
```

### 2.1 Why an opaque token and not a signed payload

A signed payload would put data in the QR that the owner could read, and would require key
distribution to every verifier. The MVP verifier is the central backend, which can look the token up
in constant time. An opaque token is simpler, smaller, and revocable in a way a signature is not
(a signed payload can only be invalidated by a key or a deny-list, not by a row update).

The signed-payload format is designed in `specs/architecture/offline-architecture.md` §7 for the
offline phase, and the `EntryClaim` model is compatible with it (a `keyId` column may be added
later without breaking the online path).

## 3. Token design (ADR-008)

| Aspect | Value | Rationale |
|---|---|---|
| Entropy | 256 bits | Brute force is infeasible even at 10⁹ attempts/second (2⁵⁶ ≈ 7×10¹⁶ seconds) |
| Encoding | base64url, 43 characters | URL-safe, no padding, no ambiguous characters |
| Generation | `crypto.randomBytes(32)` (CSPRNG) | Not `Math.random`, not a UUID |
| Storage | `SHA-256(rawToken)` hex | One-way; a database dump does not yield usable tokens |
| Lookup | Indexed unique column | Constant-time equality via the index; no `LIKE` scanning |
| Returned | Exactly once, at issuance | The client stores it only in memory / the QR |
| TTL | 5 minutes default, 1–60 minutes configurable | Long enough to park a motorcycle, short enough to expire a photographed monitor |
| Use | Single | `claimed_at` is set once; a second claim is rejected |

### 3.1 Why the hash is enough (and not a slow hash)

The token has 256 bits of entropy, so a brute-force search is infeasible regardless of the hash
speed. A slow KDF (bcrypt/argon2) would add latency to every claim and protect against nothing
that the entropy does not already protect against. The pepper used for the plate digest is a
different problem (low-entropy input) and *does* use HMAC.

### 3.2 The QR payload

```
chlat://claim/<rawToken>
```

or, for a plain QR that any scanner reads:

```
CHLATCLAIM:<rawToken>
```

The payload contains **only the token** (CLAIM-014). No plate, no site name, no price, no session
id. A photograph of the monitor therefore yields only a short-lived claim credential — which is
exactly why the TTL is short and the token is single-use.

## 4. State transitions

### 4.1 Entry claim

```
   issued ──claim succeeds──▶ CLAIMED (claimed_at set)
      │                            │
      │                            └── the session is now ACTIVE; the token is dead
      │
      ├── expiry passes ──▶ EXPIRED (implicit; expires_at < now)
      │
      ├── session cancelled ──▶ REVOKED (revoked_at set, reason: session_cancelled)
      │
      └── reissued ──▶ REVOKED (revoked_at set, reason: reissued) + a new claim row
```

| From | Event | To | Effect |
|---|---|---|---|
| — | issue | issued | The token is returned to the guard once |
| issued | claim | CLAIMED | A ticket is issued; the session becomes `ACTIVE`; `entry_at` is set |
| issued | `expires_at` passes | EXPIRED (implicit) | A claim attempt returns 410 `CLAIM_EXPIRED` |
| issued | session cancelled | REVOKED | A claim attempt returns 410 `CLAIM_CLAIM_REVOKED` |
| issued | reissue | REVOKED | A claim attempt returns 410 `CLAIM_CLAIM_REVOKED`; a new row is created |

**Expiry is implicit.** There is no cron job flipping rows to `EXPIRED`; the check is
`expires_at < now()`. A sweeper may clean up old rows for performance, but correctness never
depends on it.

### 4.2 Claim validation order

The order matters, because the error code can leak information:

```
1. hash the token
2. SELECT ... WHERE claim_token_hash = ?          → not found → 404 CLAIM_NOT_FOUND
3. revoked_at IS NOT NULL                          → 410 CLAIM_CLAIM_REVOKED
4. expires_at <= now()                             → 410 CLAIM_EXPIRED
5. claimed_at IS NOT NULL                          → 410 CLAIM_ALREADY_CLAIMED
6. session.status !== 'PENDING_CLAIM'              → 409 SESSION_INVALID_TRANSITION
7. BEGIN TX … COMMIT
```

Step 2 uses an indexed unique lookup, so the timing is dominated by the database index probe and
does not distinguish "not found" from "found but expired" by a meaningful margin.

## 5. Failure handling

| Failure | Response | Handling |
|---|---|---|
| Unknown token | 404 `CLAIM_NOT_FOUND` | Generic message; no enumeration signal |
| Expired token | 410 `CLAIM_EXPIRED` | The UI offers "ask the guard for a new code" |
| Revoked token | 410 `CLAIM_CLAIM_REVOKED` | The UI says the code is no longer valid |
| Already claimed | 410 `CLAIM_ALREADY_CLAIMED` | The UI may offer to show the existing ticket **if** the caller presents the ticket token |
| Session no longer pending | 409 `SESSION_INVALID_TRANSITION` | Rare; the session was cancelled or already claimed |
| Concurrent claim | 409 `CLAIM_CONCURRENT_CLAIM` | The unique constraint on `tickets.session_id` makes the second insert fail; the transaction rolls back |
| Rate limit exceeded | 429 | `Retry-After`; the UI shows "too many attempts, wait a moment" |
| DB failure | 500 | The transaction rolls back; no partial ticket |

### 5.1 The concurrency mechanism

The race is between two requests that both read "not claimed" and both try to insert a ticket. The
database is the arbiter:

```sql
CREATE UNIQUE INDEX tickets_session_id_key ON tickets(session_id);
```

The second insert raises a unique-violation, the transaction rolls back, and the service converts
it into `409 CLAIM_CONCURRENT_CLAIM`. Additionally, the session row is updated with a
`row_version` guard:

```sql
UPDATE parking_sessions
SET status = 'ACTIVE', entry_at = now(), row_version = row_version + 1
WHERE id = $1 AND status = 'PENDING_CLAIM' AND row_version = $2;
```

If this updates zero rows, another request already activated the session, and the service aborts.

## 6. Security considerations

| Threat | Control |
|---|---|
| Photographing the monitor and claiming later | 5-minute TTL, single use, revocable |
| Brute-forcing a token | 256 bits of entropy; SHA-256 storage; a unique index makes the lookup constant-time |
| Token leakage through logs | The logger redacts `claimToken`; the audit row records only the claim id |
| Token leakage through a referrer header | The claim page sets `Referrer-Policy: no-referrer`; the token is moved out of the URL into a `POST` body as soon as the page loads |
| Token leakage through browser history | The URL fragment (`#token=…`) is used instead of a query parameter where possible, or the token is exchanged for a short-lived claim session immediately |
| Enumeration of valid tokens | 404 for unknown; rate limiting; no differentiating timing |
| Replay of a claimed token | `claimed_at` is set in the same transaction as the ticket; a second attempt is 410 |
| A malicious owner claiming a session that is not theirs | The token is only displayed on the guard's monitor at the parking site; the physical presence of the owner is the guard's to verify at exit |
| The QR containing personal data | The payload is the token only (CLAIM-014) |
| Denial of service by flooding claims | Per-IP and per-session rate limits; a claim does no expensive work |

### 6.1 The `@Public()` route

`POST /api/v1/entry-claims/claim` is on the public allowlist. It is protected by:

* the token itself (256 bits, single use, short TTL),
* rate limiting (per IP and per session),
* strict input validation (a fixed-shape token),
* a transaction that cannot be partially applied.

## 7. Observability

| Event | Where |
|---|---|
| `entry_claim.issued` | Audit log (session, guard, expires_at) |
| `entry_claim.claimed` | Audit log (session, ticket reference) |
| `entry_claim.reissued` | Audit log (session, guard) |
| `entry_claim.revoked` | Audit log (session, reason) |
| `entry_claim.rejected` | Audit log (reason code only — **never** the token) |
| `claims_total{outcome}` | Metrics: `success`, `expired`, `revoked`, `already_claimed`, `not_found`, `rate_limited` |
| `claim_latency_ms` | Histogram |
| `claim_rate_sites` | Gauge per site (a sudden drop is the "owners are not using it" signal) |

## 8. Alternatives considered

| Alternative | Why rejected |
|---|---|
| A short numeric code (e.g. 4 digits) on the monitor | Guessable, and unusable as a bearer credential. |
| A signed payload containing the session id | Longer QR, needs key distribution, and is not revocable without a deny-list. |
| Storing the raw token in the database | A database dump then yields live claim credentials. |
| A long TTL (hours) to tolerate a slow owner | A photographed monitor would be a real credential for a long window. 5 minutes keeps the blast radius small. |
| Letting the guard type the owner's name or phone as the claim | Collects personal data with no benefit; the ticket is bearer-based. |
| Making the claim idempotent (return the same ticket on a repeat claim) | A repeat claim from a *different* device is indistinguishable from an attack. Single use is safer; recovery is handled through the guard-assisted path. |
| Not revoking on reissue | Two live tokens for one session would break the "exactly one ticket" guarantee. |
