# Offline Sync

**Status:** Deferred
**Requirement IDs:** SYNC-001 … SYNC-012
**Depends on:** `parking-session`, `entry-qr-claim`, `guest-ticket`, `exit-verification`

---

> # ⛔ DEFERRED — NOT IN THE MVP
>
> This feature is **not implemented** in the initial release. The MVP is online-first (ADR-002),
> and a site without an internet connection **cannot process entry or exit**.
>
> The requirement IDs below describe the **target** design for Phase 6 (ADR-003). They are **not**
> MVP acceptance criteria, and the MVP must not claim offline support in any user-facing text.
>
> The operational procedure for a site outage in the MVP is in
> [`../../../docs/incident-response.md`](../../../docs/incident-response.md).
>
> The full design is in
> [`../../architecture/offline-architecture.md`](../../architecture/offline-architecture.md).

---

## 1. Problem

A parking lot that cannot admit motorcycles when the internet is down cannot operate. The MVP
depends on a single VPS and a single uplink. A local parking service — a small site-local
application that becomes the **trusted authority** during an outage — is the answer.

The hard part is not the local database. It is the coordination:

* Two sites can produce events for the same plate; the central backend must reconcile them.
* A local authority and the central backend can both believe they have the latest state.
* An offline device **cannot learn** that a ticket was revoked elsewhere.
* An event may be delivered twice, or out of order, or not at all.

**The rule:** the local authority is authoritative for its site during a declared outage. The
central backend must not silently overwrite it, and it must not silently drop a conflicting event.

## 2. Scope

### 2.1 In scope (Phase 6, deferred)

* A local parking service per site, with its own database, its own API, and its own event outbox.
* The offline event contract: a unique event id, the site, the local authority, the entity
  reference, the event type, the creation time, a sequence number, the payload, a schema version,
  and integrity data.
* The central sync endpoint: authenticate, deduplicate, validate the transition, apply
  transactionally, and return `accepted | duplicate | rejected | conflict`.
* Conflict detection and a reconciliation workflow.
* Signed offline tickets with key ids and rotation.
* The sync health display in the guard UI.
* Restart recovery and the outbox's durability.

### 2.2 Out of scope

* Multiple independent offline authorities at one site (one per site is the recommended model).
* Automatic conflict resolution without human review.
* Global revocation during a disconnection (the system **cannot** know about it).
* Offline payment-provider reconciliation.

## 3. Actors

| Actor | Interaction |
|---|---|
| Security guard | Uses the local service when the central backend is unreachable |
| Local parking service | The trusted authority during a declared outage |
| Platform administrator | Monitors the sync backlog and reconciles conflicts |
| Parking owner | Sees the sync status of their site |

## 4. Behaviour

### 4.1 During an outage

1. The local service detects that the central backend is unreachable and enters **degraded** mode
   after a configurable timeout.
2. The guard's monitor connects to the local service instead of the central backend.
3. The local service creates sessions, issues entry QRs, issues tickets, and verifies exits
   locally, using the **same domain rules** and the site's local configuration.
4. Every state change is written to the local database **and** appended to the local outbox in the
   same transaction.
5. The guard sees "OFFLINE — operating locally", the backlog depth, and the time of the last
   successful sync.

### 4.2 After reconnection

1. The sync worker drains the outbox to `POST /api/v1/sync/events`.
2. The central backend authenticates the authority, deduplicates by event id, validates the
   transition, applies each event transactionally, and returns a per-event status.
3. `accepted` and `duplicate` events are removed from the outbox.
4. `rejected` and `conflict` events are retained, flagged, and surfaced for reconciliation.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| SYNC-001 | Every offline event must carry a globally unique event id, the site id, the local authority id, the entity reference, the event type, the local creation timestamp, a monotonically increasing sequence number, the payload, a schema version, and integrity data. | P1 |
| SYNC-002 | The central backend must authenticate the local authority for every batch, and must reject an unauthenticated or unknown authority. | P1 |
| SYNC-003 | The central backend must deduplicate by event id, and a repeated event id must return `duplicate` and apply no effect. | P1 |
| SYNC-004 | The central backend must validate the state transition implied by the event type, and must reject an event that implies an illegal transition. | P1 |
| SYNC-005 | The central backend must apply each accepted event inside a transaction, and a failed batch must not partially apply. | P1 |
| SYNC-006 | The central backend must return a per-event status of `accepted`, `duplicate`, `rejected`, or `conflict`, with a machine-readable code and details. | P1 |
| SYNC-007 | The central backend must preserve the details of a conflicting event for review, and must never silently overwrite central state with stale local state. | P1 |
| SYNC-008 | A retried batch must not create a duplicate session, ticket, or payment. | P1 |
| SYNC-009 | The local service must persist the outbox in the same transaction as the state change, so that a crash cannot lose an event or produce an event without a state change. | P1 |
| SYNC-010 | The local service must recover gracefully after a restart: the outbox is intact, the sync resumes, and the backlog depth and the last successful sync time are reported. | P1 |
| SYNC-011 | A ticket issued offline must be verifiable offline using a signed payload with a key id, and the signature must be verifiable with the distributed verification keys. | P2 |
| SYNC-012 | The system must not claim that a ticket is globally revoked while a site is disconnected, and the user-facing text must state the limitation. | P1 |

## 6. Acceptance criteria

> These are the **Phase 6** acceptance criteria. They are not MVP criteria, and they require
> real target hardware and a real network disconnection (a mocked failure is insufficient).

### Normal

* **SYNC-001, SYNC-002, SYNC-003, SYNC-005, SYNC-006** — Given a local authority with three queued
  events, when the batch is submitted, then all three return `accepted` and the central state
  matches the local state.
* **SYNC-003** — Given a batch containing an event id that was already applied, when it is
  submitted, then that event returns `duplicate` and no state changes.

### Failure

* **SYNC-002** — Given a batch from an unknown authority, when it is submitted, then the response is
  401 and nothing is applied.
* **SYNC-004** — Given an event implying `COMPLETED → PENDING_CLAIM`, when it is submitted, then
  that event returns `rejected` with the code `INVALID_TRANSITION`.
* **SYNC-007** — Given a local event that says `ACTIVE` while the central session is `COMPLETED`,
  when it is submitted, then the event returns `conflict` with the details of both states, and the
  central state is unchanged.
* **SYNC-010** — Given the local service is killed mid-shift, when it restarts, then the outbox is
  intact, the sync resumes, and the health view reports the backlog depth.

### Abuse

* **SYNC-008** — Given the same batch is submitted 10 times, when the events are processed, then
  exactly one session, one ticket, and one payment exist, and the duplicate submissions return
  `duplicate`.
* **SYNC-012** — Given a site is disconnected, when a ticket is presented, then the system does not
  claim that the ticket's revocation status is known globally, and the UI states the limitation.
* **SYNC-006** — Given a batch of 100 events, when it is processed, then the response contains one
  status per event and no event is silently omitted.
* **SYNC-007** — Given a conflicting event, when it is stored, then it appears in the
  reconciliation queue with both states and is not deleted by a later successful sync.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | What hardware hosts the local service? | Product owner | Phase 6 |
| Q2 | How are the verification keys distributed to the local service? | Engineering | Phase 6 |
| Q3 | How long does the local service retain its local history after reconciliation? | Engineering | Phase 6 |
| Q4 | Is a `pending` offline cash payment reconciled automatically or always by a human? | Product owner | Phase 6 |
| Q5 | May the central backend reject an offline event outright, or must it always accept-and-flag? | Engineering | Phase 6 |

## 8. Related

* `specs/architecture/offline-architecture.md` — the design of record.
* `specs/features/parking-session/` — the events being synchronized.
* `specs/features/audit/` — the conflict records.
* ADR-002 (online-first) · ADR-003 (offline authority).
