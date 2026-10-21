# Entry QR and Guest Claim

**Status:** In progress
**Requirement IDs:** CLAIM-001 … CLAIM-014
**Depends on:** `parking-session`

---

## 1. Problem

The entry QR is the moment the product is either a genuine digital replacement for the paper ticket
or an expensive piece of theatre. It does two things at once: it proves to the owner that they are
at the right parking lot, and it gives the system the moment at which the parking session
**actually begins** (ADR-004).

It is also the most attacked surface in the product. It is a bearer credential that is displayed in
public, on a monitor, for anyone in the car park to photograph. A stolen or guessed claim token
lets an attacker claim somebody else's parking session — and, more seriously, a **replayed** one
could let them walk out of the car park on a motorcycle that is not theirs.

The design therefore treats the entry QR as a **short-lived, single-use, opaque claim operation**:
it identifies a claim, it never authorizes an exit, and the token is worthless the moment it is
used.

## 2. Scope

### 2.1 In scope

* Issuing an entry QR for a pending session.
* The claim token: 256-bit random, SHA-256 hashed server-side, returned raw exactly once.
* The token TTL: 5 minutes by default, configurable per site between 1 and 60 minutes.
* Single successful claim per entry claim.
* Revocation on session cancellation, on reissue, and on expiry.
* The guest claim endpoint: no account required, rate-limited.
* Reissue: rotating the token of a still-pending session.
* Concurrency: two simultaneous claims of the same token produce exactly one ticket.
* Audit records for issuance, claim, rejection, reissue, and revocation.

### 2.2 Out of scope

* The e-ticket itself (`guest-ticket`).
* Signing a claim payload (the opaque token is sufficient online; the signed payload is an offline
  concern — deferred).
* Camera scanning on the guard's side at entry (the monitor is read by the owner's own device).
* Claiming from a link that was forwarded to somebody else — the token is the credential.

## 3. Actors

| Actor | Interaction |
|---|---|
| Security guard | Issues the entry QR; reissues it; sees the claim status |
| Guest motorcycle owner | Scans the QR and claims it, without an account |
| Registered motorcycle owner | Same as the guest; may additionally link the ticket to their account |
| Parking owner | Reviews claim rates in the site report |

## 4. Behaviour

### 4.1 Issuance

1. The guard creates a session; the API creates the session **and** an entry claim in one
   transaction.
2. The API generates a 256-bit cryptographically random token, stores `SHA-256(token)`, and returns
   the raw token exactly once, in the creation response.
3. The dashboard renders a QR of the raw token, with the site's name, the plate, and a countdown to
   expiry.
4. Nobody else — including the API, the logs, and the database — ever sees the raw token again.

### 4.2 Claim

1. The owner scans the QR; the browser opens `/ticket/claim?token=…`.
2. The browser posts the raw token to `POST /api/v1/entry-claims/claim`.
3. The API hashes the token, looks it up, and checks, in order: the claim exists; it is not revoked;
   it is not expired; it has not been claimed; the session is still `PENDING_CLAIM`.
4. In a transaction: create the ticket, mark the claim as claimed, transition the session to
   `ACTIVE` and set `entry_at`, write the audit row.
5. The API returns the ticket token (once) plus the safe public ticket payload.
6. The browser renders the ticket page and offers "save" / "screenshot".

### 4.3 Reissue

If the owner does not scan within the TTL, the guard presses **Reissue**. The old claim is revoked
and a new token is issued, with a fresh TTL. The session stays `PENDING_CLAIM`.

### 4.4 Cancel

If the motorcycle leaves without parking, the guard presses **Cancel**. The session becomes
`CANCELLED` and the claim is revoked in the same transaction.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| CLAIM-001 | The system must generate an entry claim token from at least 256 bits of cryptographically secure randomness, and must never derive it from a predictable value such as a session id, a timestamp, or a counter. | P0 |
| CLAIM-002 | The system must store only the SHA-256 hash of the claim token, and must return the raw token to the issuing guard exactly once, at issuance. | P0 |
| CLAIM-003 | The raw claim token must never be written to an application log, an audit row, an error message, a metric label, or a third-party analytics payload. | P0 |
| CLAIM-004 | An entry claim must have an expiry timestamp, computed from the server clock, using the site's configured TTL (default 5 minutes, configurable between 1 and 60 minutes). | P0 |
| CLAIM-005 | A claim must be rejected after it has been claimed, with 410 `CLAIM_ALREADY_CLAIMED`; a claim must be rejected after its expiry, with 410 `CLAIM_EXPIRED`; a claim must be rejected after revocation, with 410 `CLAIM_CLAIM_REVOKED`. | P0 |
| CLAIM-006 | A claim must be rejected for an unknown token with 404 `CLAIM_NOT_FOUND`, and the response must not distinguish between "unknown" and "expired" in a way that helps an attacker enumerate tokens. | P0 |
| CLAIM-007 | At most one ticket may be issued per parking session, enforced by a database unique constraint on `tickets.session_id` in addition to application logic. | P0 |
| CLAIM-008 | Two concurrent claims of the same valid token must result in exactly one issued ticket; the losing request must receive 409 `CLAIM_CONCURRENT_CLAIM` and must not create a second ticket. | P0 |
| CLAIM-009 | A successful claim must transition the session from `PENDING_CLAIM` to `ACTIVE`, set `entry_at` to the server clock, and start the fee clock, in the same transaction as the ticket creation. | P0 |
| CLAIM-010 | The claim endpoint must be publicly accessible without an account, and must be rate-limited to at most 20 attempts per IP per minute and at most 5 successful claims per session per minute. | P0 |
| CLAIM-011 | Reissuing an entry QR must revoke the previous claim and issue a new token with a fresh expiry, and must be recorded in the audit log with the actor. | P0 |
| CLAIM-012 | Cancelling the session must revoke its pending claim in the same transaction, so that the displayed QR can no longer be claimed. | P0 |
| CLAIM-013 | The claim response must contain only the information the owner needs to display the ticket — never the session id, the internal ticket id, the pricing policy id, the guard id, or the plate digest. | P0 |
| CLAIM-014 | The entry QR payload must contain the claim token only; it must not embed the plate number, the owner's name, or any other personal data. | P0 |

## 6. Acceptance criteria

### Normal

* **CLAIM-001, CLAIM-002** — Given a guard creates a session, when the creation response is inspected,
  then it contains a claim token of at least 43 base64url characters and the database contains only
  its SHA-256 hash.
* **CLAIM-004** — Given a site with the default TTL, when a claim is issued, then its `expires_at`
  is 5 minutes after the issue time.
* **CLAIM-009** — Given a valid unclaimed token, when the owner claims it, then the response is 200,
  exactly one ticket is issued, the session is `ACTIVE`, and `entry_at` is within 5 seconds of the
  claim time.
* **CLAIM-011** — Given a pending session with a live QR, when the guard reissues it, then a new
  token is returned, the old token no longer works, and the audit log contains an
  `entry_claim.reissued` row.

### Failure

* **CLAIM-005** — Given a claimed token, when it is claimed again, then the response is 410 with
  `CLAIM_ALREADY_CLAIMED` and no second ticket exists.
* **CLAIM-005** — Given a token whose TTL elapsed, when it is claimed, then the response is 410
  with `CLAIM_EXPIRED`.
* **CLAIM-006** — Given a random well-formed token, when it is claimed, then the response is 404
  with `CLAIM_NOT_FOUND`.
* **CLAIM-013** — Given a successful claim, when the response body is inspected, then it contains
  no "sessionId" field, no internal "id" field, and no "plateDigest" field.

### Abuse

* **CLAIM-010** — Given 20 failed claim attempts from one IP within a minute, when a 21st is made,
  then the response is 429 and the claim is not evaluated.
* **CLAIM-001** — Given 100 issued tokens, when their values are inspected, then no two are equal
  and none contains a substring of a session id, a timestamp, or a counter value.
* **CLAIM-008** — Given a valid token, when two claims are sent simultaneously, then exactly one
  ticket exists and the other response is 409 with `CLAIM_CONCURRENT_CLAIM`.
* **CLAIM-003** — Given a full claim flow, when the application logs are inspected, then no log
  line contains the raw claim token.
* **CLAIM-014** — Given the rendered entry QR, when it is decoded, then the payload contains only
  the claim token and no plate characters.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Should the entry QR be a plain token or a signed payload even online, so the QR can be rendered offline? | Engineering | Phase 2 (deferred to the offline phase) |
| Q2 | Should a claimed session show a confirmation animation on the monitor? | Product owner | Phase 3 |
| Q3 | What is the claim recovery path if the owner loses the ticket *before* the exit? | Product owner | Phase 4 (see `guest-ticket` Q2) |

## 8. Related

* `specs/features/guest-ticket/` — the ticket issued by the claim.
* `specs/features/parking-session/` — the session state machine.
* `specs/security/threat-model.md` — QR replay and token guessing.
* ADR-008 — the entry QR token design.
