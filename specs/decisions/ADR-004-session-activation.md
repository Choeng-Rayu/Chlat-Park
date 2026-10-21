# ADR-004: Session Activation on Claim

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Product owner
**Requirement IDs:** SESSION-006, SESSION-009, CLAIM-009, PRICE-005

---

## Context

A parking session has to start at some point, and that point determines two things: when the fee
clock begins, and when a session is considered "real" enough to be reported on.

The plan's §4.1 leaves the choice open: *"the session becomes active only after the claim is
completed or the guard explicitly confirms entry"*. Three candidate moments:

| Moment | The fee clock starts | The consequences |
|---|---|---|
| **A — At plate entry** | When the guard creates the session | A session that nobody claims is still charged for parking that never began. A guard who types a plate by mistake creates a chargeable session. |
| **B — At the claim** | When the owner successfully claims the entry QR | The fee is only charged for a stay that really started. The session is `PENDING_CLAIM` in the meantime. |
| **C — At the guard's confirmation** | When the guard confirms the motorcycle physically entered | The most accurate, but it adds a step to every entry and the guard may not be able to confirm at the moment they create the session. |

The choice also determines what "active" means in the reports, and whether the claim rate is a
meaningful signal.

## Decision

1. **A session is created in `PENDING_CLAIM`.** The guard enters the plate, the session is created
   transactionally, and the entry QR is issued.

2. **The session becomes `ACTIVE` when the owner successfully claims the entry QR.** This is the
   activation point (option B).

3. **The fee clock starts at activation.** `entry_at` is set at the moment of the claim. A session
   that is never claimed has no `entry_at` and therefore no fee.

4. **A guard may manually activate a never-claimed `PENDING_CLAIM` session**, and may cancel one.
   Both are audited and name the actor. Manual activation exists for the owner who has no phone,
   no data, or has walked away — the guard has taken responsibility for the entry.

5. **The client never supplies the activation moment.** The status is set by the claim service or by
   an audited guard action, and `entry_at` always comes from the server clock.

6. **There is exactly one implementation of this rule.** The claim service, the guard dashboard,
   the Telegram module, and any future local authority all go through the same domain service.
   The plan's warning — *"do not implement conflicting assumptions in separate clients"* — is
   binding.

## Consequences

### Positive

* **Only a real stay is charged.** The owner who could not scan the QR is not billed.
* **The claim rate becomes a meaningful signal.** `tickets issued / sessions created` measures how
  often a monitor QR actually became a ticket — the truest "are owners using it" metric.
* **The guest flow needs no extra step.** The claim is the activation; there is no second
  confirmation for the owner.
* **A mistyped plate is harmless.** The session sits in `PENDING_CLAIM` and can be cancelled; it
  never accrues a fee.
* **The state machine stays simple.** `PENDING_CLAIM → ACTIVE` has exactly two triggers: the claim
  and the audited manual activation.

### Negative

* **The entry has one more step than option A.** The guard must wait for the owner to scan. In
  practice the QR is already displayed while the owner is getting off the bike.
* **A `PENDING_CLAIM` session is not a "parked" session.** The report's "active sessions" count
  excludes it, so a site with a slow scan rate may look quieter than it is. The `sessions created`
  and `entry_claims issued` funnel metrics cover this.
* **A guard may forget to cancel a pending session.** The pending-session count is monitored; the
  pending sessions are listed in the dashboard so they can be cleaned up.
* **The manual activation is an escape hatch that could be abused.** It is audited, it names the
  actor, and it is only available for a never-claimed session.

### Neutral

* Option C (the guard's physical confirmation) is not implemented. The plan raised it, and it was
  rejected in favour of the lower-friction option B.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **A — Activate at plate entry** | A session that nobody claims is still charged for. A typo becomes a chargeable session. The fee clock would start before the motorcycle is even parked. |
| **C — Activate on the guard's explicit confirmation** | It adds a step to every entry and the guard often cannot confirm at the moment of creation. It also delays the fee clock for the common case. It could be added later as an optional site policy without changing the model. |
| **Activate on the claim, but start the fee at plate entry** | Contradictory: the fee would be charged for time before the motorcycle was parked. |
| **A grace period before the fee starts** | A grace period is a *pricing* concept (a discount for a short stay), not an activation concept. It is implemented in the hourly rule, not in the state machine. |
| **Auto-cancel a pending session after N minutes** | A reasonable idea, but it would cancel a session whose owner is simply slow. Deferred; the dashboard shows the pending sessions instead. |
| **Let the client set the activation time** | The client clock is untrusted, and a client could activate a session early to shorten a later fee. |

## Related

* `specs/features/parking-session/` — the state machine and the fee clock.
* `specs/features/entry-qr-claim/` — the claim that activates.
* `specs/features/pricing-and-payment/` — the fee window.
* `specs/product/product-brief.md` §7 — the locked decision L3.
