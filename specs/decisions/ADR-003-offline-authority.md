# ADR-003: Offline Authority Model

**Status:** Accepted (design target — implementation deferred to Phase 6)
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** SYNC-001 … SYNC-012 (deferred)

---

## Context

ADR-002 settles that the MVP is online-first. This ADR settles the **shape** of the offline
capability, so that the domain model and the event contract can be designed now and the code can
be written later without a redesign.

The core problem is coordination. When a site is disconnected, its local service becomes the
authority for that site. But the central backend also has state, and it may have state that is
*newer* than the local state for some entities. And two events may conflict.

There are three plausible authority models:

| Model | Description | Problem |
|---|---|---|
| **Central always wins** | The central backend rejects any local event that conflicts with its state. | During a real outage the local site keeps operating, and its work is discarded on reconnection. The site operated for nothing. |
| **Last write wins** | The most recent event wins. | Wall clocks across two machines are not comparable, and a stale event with a later clock silently destroys good data. |
| **Local wins during a declared outage** | The local authority is authoritative for its site while an outage is declared; the central backend flags the conflicts for human review. | Requires an outage declaration, and requires a reconciliation workflow. |

There is also the **multiple authorities per site** question: two local devices at one site could
authorize the same ticket with no way to coordinate.

## Decision

1. **One designated local authority per parking site.** The site is configured with exactly one
   `localAuthorityId`. A second device presenting a different id is rejected by the central backend
   and surfaced in the health view. This is the recommended model for the first offline release.

2. **The local authority is authoritative for its site during a declared outage.** The central
   backend accepts the local transitions while the outage is declared, subject to the site's
   configured policy. The outage declaration is a platform-level event that the local authority
   reports.

3. **Outside a declared outage, the central backend never silently overwrites central state with
   stale local state.** A conflicting event is stored with `syncStatus = 'conflict'` and the details
   of both states, and it appears in a reconciliation queue for a human to resolve.

4. **Every offline event carries:** a globally unique `eventId`, the `siteId`, the
   `localAuthorityId`, the entity reference, the event type, `createdAtLocal` (UTC), a monotonic
   `sequenceNumber`, the payload, a `schemaVersion`, and integrity data over the canonical body.

5. **The central backend must, for every batch:** authenticate the authority; deduplicate by
   `eventId`; validate the implied state transition; apply the event transactionally; return
   `accepted | duplicate | rejected | conflict` per event; preserve the conflict details; and allow
   a safe retry that does not duplicate a session or a payment.

6. **The local outbox is written in the same transaction as the state change.** A crash can
   therefore neither lose an event nor produce an event without a state change.

7. **Offline payments are recorded as `PENDING` / unverified**, unless the payment method itself
   provides a reliable offline confirmation mechanism. In the MVP (manual cash), an offline cash
   payment is reconciled by a human action at the central side, or left `PENDING` if unreconciled.

8. **The offline ticket is a signed payload** with a key id, a version, the ticket and session
   references, the site id, the issue time, and the minimum claims. It contains no personal data.
   The signature proves the issuer created the payload; the **local session state** decides whether
   the ticket may be used.

9. **The private signing keys live on trusted infrastructure only.** Only verification keys are
   distributed. Every payload carries a `kid`, and rotation keeps the old key valid for
   verification until its `notAfter`.

10. **The system does not claim global revocation while disconnected.** A local service cannot
    learn about a revocation issued elsewhere, and the user-facing text states the limitation.

## Consequences

### Positive

* **The site keeps operating during an outage**, and its work is not discarded on reconnection.
* **A ticket cannot be authorized twice by two devices**, because there is only one authority per
  site.
* **No data is silently lost.** A conflict is flagged, not applied, and the details of both states
  are preserved for review.
* **The event contract is specified now**, so the offline phase does not require a domain-model
  redesign.
* **The "no global revocation while disconnected" limitation is stated honestly** rather than
  claimed away.

### Negative

* **An outage must be declared** for the local authority to be authoritative. The declaration is a
  platform-level action; if it is not made, the local events are flagged as conflicts instead of
  being applied. This is a deliberate trade: an automatic declaration risks the local device being
  wrong about the outage.
* **A reconciliation workflow is required.** Conflicts need a human. That is operational work the
  platform operator must own.
* **The offline key distribution is unsolved** until the hardware is chosen.
* **The event contract is unproven.** It is specified without a working implementation.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | **The hardware.** Mini PC, a local server, a reused desktop? | Depends on the site's power, network, and physical security. | Phase 6 |
| D2 | **The physical placement and the network topology.** | The local service must be reachable by the guard's device over the site LAN. | Phase 6 |
| D3 | **The guard's browser talks to the local service directly, or through a reverse proxy on the LAN?** | A proxy is cleaner for the client's URL handling; a direct connection is simpler. | Phase 6 |
| D4 | **The key distribution channel and cadence.** | Over the authenticated sync channel, out of band from the event stream. | Phase 6 |
| D5 | **The local data retention after reconciliation.** | How long does the local database keep its history? | Phase 6 |
| D6 | **Are offline cash payments reconciled automatically, or always by a human?** | The current answer is always by a human. | Phase 6 |
| D7 | **May the central backend reject an offline event outright, or must it always accept-and-flag?** | The current design allows both, configurable per site. | Phase 6 |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Central always wins | The site's work during an outage is discarded. The site operated for nothing. |
| Last write wins | Wall clocks are not comparable across machines, and a stale event with a later clock destroys good data. |
| Multiple local authorities per site | Two devices could authorize the same ticket with no coordination. One authority per site is the recommendation. |
| A message queue (Redis / RabbitMQ) for the events | An extra operational dependency for a pilot-scale system. A durable outbox plus an HTTP batch endpoint is sufficient. |
| Reusing the online ticket format offline | The online token requires a server lookup. Offline verification needs a self-contained signed payload. |
| Blockchain or a Merkle tree for the audit trail | Enormous complexity for a problem the append-only audit table and the restricted database role already solve. |
| Automatically declaring the outage when the central backend is unreachable | A false outage declaration would let a stale local device overwrite good central state. The declaration is deliberate. |

## Related

* `specs/architecture/offline-architecture.md` — the full design of record (DEFERRED).
* `specs/features/offline-sync/` — the deferred requirements and the Phase 6 acceptance criteria.
* ADR-002 — online-first.
* `specs/security/threat-model.md` §7 — the accepted residual risk R-2.
