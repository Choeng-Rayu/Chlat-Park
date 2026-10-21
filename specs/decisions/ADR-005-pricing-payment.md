# ADR-005: Pricing and Payment Scope for the MVP

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Product owner
**Requirement IDs:** PRICE-001 … PRICE-012, PAY-001 … PAY-012

---

## Context

Pricing determines what the parking lot earns, and payment recording determines what the platform
believes it earned. Both are areas where a "simple" implementation creates a trust problem.

The plan's §19 leaves three questions open: the pricing model, the payment scope, and the payment
confirmation evidence. The project owner has now settled them:

* **Pricing:** configurable — flat, hourly, or tiered, per site.
* **Payment:** **manual cash recording with an audited reason. No payment-provider integration in
  the MVP.**
* **Corrections:** the payment status enum gains `VOIDED` — *"corrections to manual cash are
  explicit and audited, not silent edits."*

The last point is the important one. With manual cash, the guard is the cashier. A mistake is
inevitable: the wrong amount, the wrong session, the wrong site. The question is not *whether*
mistakes happen but *how they are corrected* — and "silently editing the row" destroys the one
thing the audit log exists to provide.

## Decision

1. **The pricing model is configurable per site**, with three rule types:
   * `FLAT` — a fixed amount for the stay.
   * `HOURLY` — a rate per whole unit, with a grace period and an optional cap.
   * `TIERED` — a set of bands; exactly one band is selected per stay.

2. **Pricing policies are versioned and immutable.** A change creates a new version with a new id
   and an `effective_from` timestamp. An existing version is never edited.

3. **A session records the pricing policy id and version in effect at its creation**, and every
   fee computation for that session uses that version. Today's policy never re-prices history.

4. **The fee is snapshotted onto the session at exit completion** (`fee_amount_minor`,
   `fee_currency`), in the same transaction as the completion. This makes the historical revenue
   stable against later pricing changes, and it makes the "uncollected at close" figure reliable.

5. **The payment scope for the MVP is manual cash only.** The guard records the method, the
   amount, the currency, and a reason. There is no payment provider, no card capture, no KHQR
   reconciliation, and no PCI scope.

6. **Payment statuses are `UNPAID`, `PENDING`, `PAID`, `FAILED`, `EXEMPT`, and `VOIDED`.**
   * `PAID` requires the confirming guard and the confirmation time.
   * `EXEMPT` requires the `site.payments.exempt` permission and a reason, and records the
     authorizing actor.
   * `VOIDED` is the correction state.

7. **A correction is a `VOIDED` transition, never a delete and never an in-place edit.** The row
   keeps its original amount; the status, the reason, the actor, and the time are added. A new
   payment is then recorded as a new row.

8. **A session has at most one `PAID` payment at a time**, enforced by a partial unique index
   (`payments(session_id) WHERE status = 'PAID'`).

9. **The payment requirement for the exit** is satisfied by a `PAID` payment whose amount is at
   least the fee due, or by an `EXEMPT` record, or by a site policy that requires no fee. `PENDING`,
   `FAILED`, and `VOIDED` never satisfy it.

10. **A receipt screenshot never confirms a payment automatically.** A confirmation is an explicit,
    audited guard action with a reason.

11. **Revenue is `PAID` only.** `EXEMPT` is not revenue — it is *revenue leakage*, and it is
    reported as a separate, prominent figure. `VOIDED` subtracts from revenue. `FAILED` is a
    count, not money.

## Consequences

### Positive

* **The pricing rules fit the real business.** A flat fee for a market, an hourly fee for a mall,
    a tiered fee for a long stay.
* **The history is stable.** A price change tomorrow does not change what was owed yesterday. The
    policy version and the fee snapshot make every historical figure reproducible.
* **The corrections are visible.** A voided payment reduces the collected figure, and it is
    reported separately rather than disappearing. A mistake is a visible event, not a silent edit.
* **The leakage is visible.** An exemption is a business decision that a guard or an owner can
    make; making it visible in a separate figure is what keeps it from becoming a habit.
* **The MVP has no payment-provider complexity.** No webhook reconciliation, no provider outage, no
    PCI scope, no chargeback handling.

### Negative

* **The revenue figure depends on the guards' honesty and accuracy.** Manual cash is a
  human-in-the-loop system, and the audit trail is the accountability mechanism, not a guarantee.
* **There is no independent confirmation of the payment.** The "evidence" is the guard's
  attestation plus the reason. This is the accepted trade for the MVP's scope.
* **A `VOIDED` payment is still in the table.** The reporting queries must exclude it correctly.
  That is a source of "the revenue looks wrong" incidents, and the queries are tested for it.
* **A second `PAID` payment is impossible, but a `PENDING` plus a `PAID` is possible.** That is
  intentional: the pending row is the history of an incomplete collection.
* **Adding a payment provider later is a schema and workflow change.** `provider_reference` exists
  in the schema for exactly this reason, so the migration is additive.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | Is the grace period configurable per site, and what is the default? | The current answer: configurable, default 0. | Phase 4 |
| D2 | Should the hourly rule support a pro-rata first hour as an option? | A site with short stays may want it. | Phase 5 |
| D3 | What is the maximum tiered-policy complexity the UI should support? | The current design allows any number of tiers; the UI supports a practical number. | Phase 4 |
| D4 | Should a "free parking" policy be a separate type? | The current answer: a `FLAT` policy with an amount of 0. | Phase 4 |
| D5 | Which payment methods are accepted at each site? | Configurable per site; the MVP supports `CASH`, `KHQR_MANUAL`, and `OTHER_MANUAL`. The KHQR reconciliation process is undefined — the manual recording is the whole of the MVP behaviour. | Phase 4 |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| A single fixed price per site | Too rigid; every site is different, and the price would still need versioning. |
| Editing a pricing policy in place | The same policy id would describe two different prices, and the historical sessions would become untraceable. |
| A payment provider in the MVP | Scope. The provider integration brings webhooks, reconciliation, chargebacks, and PCI obligations. Manual cash is what the pilot needs. |
| Editing a payment row in place | The correction would be invisible. The whole point of `VOIDED` is that a mistake is a visible, attributed event. |
| Deleting a mistaken payment | Same problem, worse: the row disappears and the audit trail has a hole. |
| Deleting a mistaken session | The same. Sessions are never deleted; they are cancelled or completed. |
| Folding the exemptions into the revenue | Exemptions would become invisible, and the leakage would grow. |
| Rounding at each billing step | Compounding error, and confusing intermediate values. The rounding is applied once, at the end. |
| A unique constraint of one payment row per session | A correction would require deleting the original row. Several rows with a partial unique index on `PAID` is the right shape. |

## Related

* `specs/features/pricing-and-payment/` — the requirements and the design.
* `specs/features/exit-verification/` — the payment requirement that gates the exit.
* `specs/features/admin-console/` — the revenue and leakage reporting.
* ADR-012 — the currency and the rounding.
