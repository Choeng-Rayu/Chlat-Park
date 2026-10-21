# Parking Session

**Status:** In progress
**Requirement IDs:** SESSION-001 … SESSION-014
**Depends on:** `parking-sites`, `authorization`

---

## 1. Problem

A parking session is the aggregate root of Chlat-Park. It is the thing that a ticket belongs to, that
a fee is calculated for, that a payment settles, and that an exit closes. If the session's state is
ambiguous, every downstream decision is ambiguous: the owner does not know whether they may leave,
the guard does not know whether the fee is owed, and the owner of the parking lot does not know what
was collected.

Two properties matter more than anything else:

1. **Transitions are explicit.** A session moves between a small, closed set of states, and every
   move has a named trigger, preconditions, and an actor. There is no "set the status" endpoint.
2. **Time is server-authoritative.** Entry time, fee start, and exit time all come from the server
   clock. A client never sends a timestamp.

**The activation decision is settled (ADR-004):** a session becomes `ACTIVE` when the owner
**claims** the entry QR. A guard may manually activate or cancel a never-claimed pending session.
The fee clock starts at claim, not at plate entry — otherwise a bike that nobody claimed would
accumulate a charge for parking that never began.

## 2. Scope

### 2.1 In scope

* Creating a session in `PENDING_CLAIM` (transactional).
* Plate entry, normalization, correction, and storage of both the original and the normalized form.
* The session state machine and every legal transition.
* Manual activation and cancellation of a never-claimed pending session.
* Moving to `EXIT_PENDING` and completing the exit (the completion itself is specified in
  `exit-verification`).
* Opening and resolving a manual review case.
* Listing sessions at a site with filters and pagination.
* Reading a single session within scope.
* The fee snapshot written at exit completion.
* The fee clock that starts at claim.

### 2.2 Out of scope

* Ticket issuance and the claim flow (`entry-qr-claim`, `guest-ticket`).
* Fee calculation and payment recording (`pricing-and-payment`).
* The exit verification decision itself (`exit-verification`).
* Recurring or scheduled sessions, vehicle types, or bay assignment.
* Automatic expiry of `ACTIVE` sessions — a session stays active until someone acts on it.

## 3. Actors

| Actor | Interaction |
|---|---|
| Security guard | Creates a session, activates or cancels a pending one, lists active sessions |
| Parking owner | Reads sessions, reviews exceptions |
| Platform administrator | Reads and audits sessions across sites |
| Guest / registered owner | Never creates or modifies a session directly |

## 4. Behaviour

### 4.1 Creation

1. The guard selects a site and types a plate.
2. The API verifies the site is in the guard's scope and the site is active.
3. The API normalizes the plate (ADR-007) and computes the plate digest.
4. Inside a transaction: check the duplicate-active-session policy; create the session in
   `PENDING_CLAIM` with `entry_at = null`; create the entry claim; write the audit row.
5. The response includes the created session and the raw claim token (once).

### 4.2 Activation

The session becomes `ACTIVE` when the owner claims the entry QR. A guard may also activate it
manually (the owner has no phone, or the claim was lost) — the activation is audited and names the
actor. **Either way, `entry_at` is set at the moment of activation**, and the fee clock starts
there.

### 4.3 Cancellation

A guard may cancel a `PENDING_CLAIM` session that was never claimed. The entry claim is revoked
in the same transaction. A cancelled session cannot be claimed.

### 4.4 Listing

The guard dashboard shows the site's sessions, filterable by status and by date, paginated, and
scoped to sites the actor may access.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| SESSION-001 | The system must create a parking session with a unique id, its site, the original and normalized plate, the creating guard, the status `PENDING_CLAIM`, the pricing policy version in effect at creation, and a creation timestamp taken from the server clock. | P0 |
| SESSION-002 | Session creation must be transactional: the session, the entry claim, and the audit row must all be committed together or not at all. | P0 |
| SESSION-003 | The client must never supply the session status, the site id, the guard id, the entry time, or the fee. These are derived server-side; a body field attempting to set them must be rejected by validation. | P0 |
| SESSION-004 | The plate must be stored twice: `plate_id_original` exactly as typed by the guard, and `plate_id_normalized` after the ADR-007 normalization. The original must be preserved even when it is not in canonical form. | P0 |
| SESSION-005 | The server must compute `plate_digest = HMAC-SHA256(server_pepper, plate_id_normalized)` and store it on the session, indexed, for lifetime distinct-guest counting. | P0 |
| SESSION-006 | A session's `entry_at` must be null while the status is `PENDING_CLAIM`, and must be set to the server clock time at the moment the session transitions to `ACTIVE`, whether by claim or by manual activation. | P0 |
| SESSION-007 | The fee calculation window must begin at `entry_at` and end at `exit_at`, both taken from the server clock, and must be computed in the site's timezone for display while remaining absolute in storage. | P0 |
| SESSION-008 | The system must enforce the following state machine and reject any other transition with 409 `SESSION_INVALID_TRANSITION`: `PENDING_CLAIM → ACTIVE \| CANCELLED \| MANUAL_REVIEW`; `ACTIVE → EXIT_PENDING \| MANUAL_REVIEW`; `EXIT_PENDING → COMPLETED \| ACTIVE \| MANUAL_REVIEW`; `MANUAL_REVIEW → ACTIVE \| EXIT_PENDING \| COMPLETED`. | P0 |
| SESSION-009 | Only a session in `PENDING_CLAIM` may be manually activated, and only a session in `PENDING_CLAIM` may be cancelled. Both actions must be recorded in the audit log with the actor. | P0 |
| SESSION-010 | Cancelling a session must revoke its pending entry claim in the same transaction, so that the entry QR can no longer be claimed. | P0 |
| SESSION-011 | Listing sessions must be restricted to sites in the actor's scope, must support filtering by status and by a date range, and must be paginated with a stable sort. | P0 |
| SESSION-012 | A session that is `COMPLETED` must not be reopened, and its ticket must not authorize a second exit, through any ordinary API. | P0 |
| SESSION-013 | The system must record the pricing policy id and version used for the session at creation, and must never re-price a historical session with a newer policy. | P0 |
| SESSION-014 | The system must write the fee snapshot (`fee_amount_minor`, `fee_currency`) on the session in the same transaction that completes the exit, so that historical revenue is stable against later pricing changes. | P0 |

## 6. Acceptance criteria

### Normal

* **SESSION-001, SESSION-004** — Given a guard at site "S1", when the guard creates a session with
  plate " ab-123 ", then the session's `plateIdOriginal` is " ab-123 " and its
  `plateIdNormalized` is "AB123" and its status is `PENDING_CLAIM` and its `entryAt` is null.
* **SESSION-002** — Given the entry-claim insert fails, when the guard creates a session, then the
  response is 500 and no session row exists.
* **SESSION-006, SESSION-007** — Given a pending session, when the owner claims it, then the
  session becomes `ACTIVE` and `entryAt` equals the claim time and the fee window starts there.
* **SESSION-009** — Given a pending session, when a guard manually activates it, then the session
  becomes `ACTIVE` and the audit log contains a `session.activated` row naming the guard.

### Failure

* **SESSION-008** — Given a `COMPLETED` session, when a guard attempts to move it to `ACTIVE`, then
  the response is 409 with `SESSION_INVALID_TRANSITION`.
* **SESSION-009** — Given an `ACTIVE` session, when a guard attempts to cancel it, then the response
  is 409 with `SESSION_INVALID_TRANSITION`.
* **SESSION-003** — Given a creation request whose body contains "status" equal to "COMPLETED",
  then the response is 400 with `VALIDATION_FAILED` and the field is named.
* **SESSION-010** — Given a pending session with a live entry QR, when the guard cancels the
  session, then the entry claim is revoked and a later claim of that QR returns 410
  `CLAIM_CLAIM_REVOKED`.
* **SESSION-012** — Given a completed session, when the exit completion endpoint is called again,
  then the response is 409 with `EXIT_ALREADY_COMPLETED` and no second completion is recorded.

### Abuse

* **SESSION-003** — Given a creation request whose body contains "entryAt" in the past, then the
  request is rejected and the stored `entryAt` is null until activation.
* **SESSION-005** — Given 100 sessions for the same plate across 100 days, when the admin
  adoption query is run, then the count of distinct guests is 1 and the count of sessions is 100.
* **SESSION-011** — Given a guard assigned to site "S1" and another guard assigned to site "S2",
  when guard "G1" lists sessions, then only sessions at "S1" are returned.
* **SESSION-014** — Given a site's pricing policy changes from 1.00 to 2.00 after a session
  completed at 1.00, when the revenue report is run, then the completed session still reports a
  fee of 1.00.
* **SESSION-013** — Given a session created under pricing policy version 3, when the site moves to
  version 4, then the session still references version 3 and a fee preview for that session uses
  version 3.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Should a session be auto-cancelled if the guard abandons the flow before showing the QR? | Product owner | Phase 2 |
| Q2 | Is a maximum parking duration required (a long-stay tariff)? | Product owner | Phase 4 |
| Q3 | Should a session be transferable between guards at a shift change? | Product owner | Phase 5 |

## 8. Related

* `specs/features/entry-qr-claim/` — the claim that activates the session.
* `specs/features/exit-verification/` — verification and exit completion.
* `specs/features/pricing-and-payment/` — the fee window and the snapshot.
* `specs/architecture/offline-architecture.md` — the offline event model.
