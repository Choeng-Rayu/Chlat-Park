# ADR-002: Online-First Deployment

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** — (governs the deployment model)

---

## Context

Chlat-Park replaces paper parking tickets at real sites. That means the system is used in a
physical place, at a specific time, by a person who is trying to leave a car park. Every minute of
unavailability is a minute in which a motorcycle is held, a guard is improvising, or a bike
leaves without being charged.

Two deployment models are possible:

* **Online-first** — the central backend is the only authority. The site needs a working internet
  connection to admit and release motorcycles.
* **Offline-capable** — a site-local service can take over during an outage, issue and verify
  tickets locally, and reconcile with the central backend later.

The offline-capable model is strictly more robust, but it is also significantly more expensive to
build: a second application, a second database, a synchronization protocol, a conflict-resolution
workflow, offline key management, and a hardware decision for every site. The plan's §16 places it
at Phase 6, after the online product has proven itself.

The MVP must also be honest. A product that claims offline capability and cannot deliver it is
worse than a product that states its limitation clearly.

## Decision

1. **The MVP is online-first.** The central backend on the VPS is the single source of truth and
   the only authority. A parking session exists in the central database or it does not exist.

2. **The PWA may cache static assets and a previously loaded ticket's display data**, so an owner
   can read their plate, their site, and their entry time while offline. It **must not** present a
   cached ticket as "valid", and it **must not** promise first-time ticket issuance while offline.

3. **The Telegram channel requires the internet.** During a complete outage, the bot cannot issue a
   new response, and the product states this plainly.

4. **The domain model is designed so that a local authority can be added without a rewrite:**
   * the session and ticket state machines are explicit and closed;
   * the events are enumerable and versioned;
   * the event contract (`eventId`, `siteId`, `localAuthorityId`, `sequenceNumber`, `schemaVersion`,
     integrity data) is specified in advance;
   * the conflict policy is specified in advance.

5. **No user-facing text may claim offline support.** The MVP's offline capability is described
   accurately: an internet connection is required.

6. **The local parking service is designed now and built in Phase 6** (ADR-003). The design of
   record is `specs/architecture/offline-architecture.md`, which carries a DEFERRED banner.

7. **Camera and ANPR, and barrier control, are out of scope.** They are separate features with
   separate risks, and neither is required to replace the paper ticket.

## Consequences

### Positive

* **The MVP is buildable and testable in a realistic timeframe.** No local hardware, no second
  database, no sync protocol to debug.
* **One source of truth.** There is no "which copy is authoritative?" question during the pilot,
  and no conflict-resolution workflow to operate.
* **The domain model is proven before it is distributed.** If the state machine is wrong, it is
  wrong in one place, and it is cheap to fix.
* **The offline phase is additive.** The local service reuses the domain services; it does not
  require a different domain model.

### Negative

* **A site with no internet cannot operate.** This is a real operational risk and the single most
  important limitation of the MVP. The mitigation is a **documented outage procedure**
  (`docs/incident-response.md`), which tells the guard what to do: park manually on paper, and
  reconcile afterwards.
* **The single VPS is a single point of failure.** A VPS outage affects every site. Mitigated by
  the backups, the tested restore, and the monitoring — not eliminated.
* **The event contract may be wrong.** It is specified without a working implementation to
  validate it. Mitigated by reviewing it against the implemented online behaviour during Phase 6,
  and by versioning the schema.
* **The offline capability may never be built.** That is a legitimate outcome, and the online
  product is still valuable.

### Neutral

* The plan's §1 promise — "the product must support online operation first and be architected for
  a future offline mode" — is exactly this decision.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Offline-first from the start | The cost is disproportionate for the pilot, and the offline design would be built on an unproven domain model. The state machine would change during Phase 6, and the sync protocol would have to change with it. |
| A PWA that claims to work offline | A cached ticket cannot be validated offline. Presenting it as valid is a false promise, and it is the exact failure the product's central rule warns against. |
| Building the local service but not shipping it | The code would rot, and it would consume the MVP's time. The **design** is done now; the code waits. |
| A local service per site with no central backend | That is a different product — a standalone parking system per site, with no platform revenue or adoption visibility. It also loses the owner's multi-site view. |
| Redis-backed local caching of the central state | A cache is not an authority. It would give a false sense of offline capability while still requiring the central backend for validation. |
| Adding camera/ANPR to the MVP | Out of scope by decision L6. It adds a camera, an inference dependency, an accuracy problem, and a privacy problem, none of which is needed to replace the paper ticket. |
| Barrier control | Out of scope by decision L6. |

## Related

* `specs/architecture/offline-architecture.md` — the deferred design, with the DEFERRED banner.
* `specs/features/offline-sync/` — the deferred requirements and the Phase 6 acceptance criteria.
* `docs/incident-response.md` — the outage procedure that mitigates the accepted risk.
* `specs/product/product-brief.md` §7 — the locked decisions.
