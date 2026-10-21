# Pricing and Payment

**Status:** In progress
**Requirement IDs:** PRICE-001 … PRICE-012, PAY-001 … PAY-012
**Depends on:** `parking-sites`, `parking-session`

---

## 1. Problem

Pricing is where a parking system earns its keep, and where it earns its disputes. Three decisions
from the project owner shape this feature:

* **Configurable rules** — a site may charge a flat fee, an hourly fee, or a tiered fee, and it may
  change that over time.
* **Manual cash only in the MVP** — no payment provider, no card, no KHQR reconciliation. A guard
  records what was paid, and that record is auditable.
* **Corrections are explicit** — a mistaken cash record is **voided**, with a reason, and the audit
  trail shows it. It is never silently edited or deleted.

Two properties follow. First, **the price of a stay must not change after the fact**: the fee is
calculated from a *versioned* policy and snapshotted onto the session when the exit completes.
Second, **money is never a float**: every amount is an integer number of minor units in a single
defined currency.

## 2. Scope

### 2.1 In scope

* Pricing policies: flat, hourly, tiered; versioned per site; an effective-from timestamp.
* Fee calculation from the server clock, with a documented rounding rule.
* The fee preview, shown before payment.
* The fee snapshot on the session at exit completion.
* Manual cash payment recording: method, amount, reason.
* Payment states: `UNPAID`, `PENDING`, `PAID`, `FAILED`, `EXEMPT`, `VOIDED`.
* Exemptions: who, when, why.
* Voiding a manual cash record: an explicit correction with a reason.
* The payment requirement that gates the exit.
* Owner reports over payments.

### 2.2 Out of scope

* Payment-provider integration, card capture, or any PCI-scoped handling.
* Automated KHQR reconciliation.
* Refunds and partial refunds.
* Discount coupons or promotional pricing.
* Per-minute billing granularity beyond the policy's own unit.
* Dynamic or surge pricing.

## 3. Actors

| Actor | Interaction |
|---|---|
| Security guard | Sees the fee, records a payment, requests an exemption (with a reason) |
| Parking owner | Creates pricing policies, grants exemptions, reviews payment reports |
| Platform administrator | Reviews platform revenue: collected, exempt, voided, failed |
| Guest / registered owner | Sees the fee at the exit |

## 4. Behaviour

### 4.1 Pricing

1. An owner creates a pricing policy for their site: a rule type, its configuration, and an
   effective-from timestamp. Each creation makes a **new version**; policies are never edited in
   place.
2. The site has exactly one *effective* policy at a time. Creating a policy with an
   `effective_from` in the future schedules it; the previous one remains effective until then.
3. A session stores the pricing policy id and version **at creation**, so the session is priced by
   the rules that applied when it started.
4. The fee is computed as `calculate(session, policy, now)`:
   * **flat** — a fixed amount for the whole stay;
   * **hourly** — `rate × ceil(durationHours)`, with a grace period;
   * **tiered** — a set of bands (`up to N hours → amount A`, `up to M hours → amount B`, …), with
     the band selected by the duration.
5. The amount is rounded **once**, at the end, half-up, on the minor unit. The fee is never
   negative, and its minimum is 0.

### 4.2 Payment

1. The guard records a payment: the method (from the site's accepted methods), the amount, and a
   reason. The record starts in `PAID` for cash (the guard has the money), or `PENDING` when the
   guard explicitly says it is not yet confirmed.
2. The status is `EXEMPT` when the fee is waived. An exemption requires the permission and a
   reason.
3. A mistaken record is **voided**: the row stays, its status becomes `VOIDED`, and the reason and
   the actor are recorded. `VOIDED` subtracts from revenue; it does not delete the row.
4. A session may have several payment rows over its life (a correction, then a re-record), but at
   most one `PAID` row at a time. The unique constraint enforces it.

### 4.3 The fee clock

The window is `[entry_at, exit_at]`, both from the server clock. `entry_at` is set at claim
(ADR-004). A session that has not been claimed has no fee.

## 5. Requirements — pricing

| ID | Requirement | Priority |
|---|---|---|
| PRICE-001 | A pricing policy must belong to exactly one site and must have an integer version that increases monotonically for that site. | P0 |
| PRICE-002 | A pricing policy must have a rule type of `FLAT`, `HOURLY`, or `TIERED`, and a configuration object validated against the schema for that rule type. | P0 |
| PRICE-003 | An existing pricing policy must never be modified. A change creates a new version with a new id and an `effective_from` timestamp. | P0 |
| PRICE-004 | A session must record the pricing policy id and version in effect at creation, and every fee computation for that session must use that policy — never a newer one. | P0 |
| PRICE-005 | The fee must be computed from server-authoritative timestamps: the window is `[entry_at, exit_at]`, and a session with no `entry_at` has no fee. | P0 |
| PRICE-006 | The fee must be rounded exactly once, at the end of the calculation, using the half-up rule on the currency's minor unit; the result must never be negative and must never be below zero. | P0 |
| PRICE-007 | The `HOURLY` rule must bill whole hours, rounding the duration **up** to the next whole hour, and must apply the site's grace period before the first billable hour. | P0 |
| PRICE-008 | The `TIERED` rule must select exactly one band per stay, using the duration in minutes, and must not sum the bands. | P0 |
| PRICE-009 | The fee preview shown to the guard must be computed by the same function that writes the snapshot, so the preview and the charge cannot diverge. | P0 |
| PRICE-010 | The fee snapshot (`fee_amount_minor`, `fee_currency`) must be written onto the session in the same transaction that completes the exit. | P0 |
| PRICE-011 | The currency of a fee must be the site's currency; a client-supplied currency must be rejected. | P0 |
| PRICE-012 | A pricing policy with an `effective_from` in the future must not be used for a fee until that time; the currently effective policy applies before it. | P0 |

## 6. Requirements — payment

| ID | Requirement | Priority |
|---|---|---|
| PAY-001 | Every amount must be stored as an integer number of minor units together with an explicit currency; no floating-point amount may be stored or transmitted. | P0 |
| PAY-002 | A payment must have an explicit status from `UNPAID`, `PENDING`, `PAID`, `FAILED`, `EXEMPT`, `VOIDED`, and an explicit method from the site's accepted methods. | P0 |
| PAY-003 | Recording a payment must require the `site.payments.record` permission, must record the method, the amount, the currency, and a reason, and must be written to the audit log. | P0 |
| PAY-004 | A `PAID` payment must record the confirming guard and the confirmation time. | P0 |
| PAY-005 | A session must have at most one `PAID` payment at a time; a second `PAID` payment for the same session must be rejected with 409 `PAY_ALREADY_PAID`. | P0 |
| PAY-006 | An exemption must require the `site.payments.exempt` permission and a non-empty reason, and must record the authorizing actor; the exemption is not revenue and is reported separately. | P0 |
| PAY-007 | Voiding a payment must require an authorized actor and a reason, must set the status to `VOIDED` rather than deleting the row, and must record the original amount, the actor, and the reason in the audit log. | P0 |
| PAY-008 | A `VOIDED` payment must not satisfy the payment requirement, and must not appear in the collected revenue total. | P0 |
| PAY-009 | A `PENDING` or `FAILED` payment must not satisfy the payment requirement, and must block the exit. | P0 |
| PAY-010 | A payment record must be denormalized with the session's `site_id`, and the invariant `payments.site_id = parking_sessions.site_id` must be enforced in code and verified by a nightly consistency check. | P0 |
| PAY-011 | The payment requirement for a session must be satisfied by a `PAID` payment whose amount is at least the fee due, or by an `EXEMPT` record, or by a site policy that requires no fee. | P0 |
| PAY-012 | A receipt screenshot must never cause a payment to be marked as confirmed automatically; a confirmation is an explicit, audited guard action. | P0 |

## 7. Acceptance criteria

### Normal

* **PRICE-002, PRICE-006** — Given a `FLAT` policy of 1.50 in "USD", when the fee is calculated
  for a 3-hour stay, then the fee is 150 minor units.
* **PRICE-007** — Given a `HOURLY` policy of 1.00 per hour with a 10-minute grace period, when the
  fee is calculated for a 70-minute stay, then the duration is 2 billable hours and the fee is 200
  minor units.
* **PRICE-008** — Given a `TIERED` policy of "1 hour → 1.00, 4 hours → 3.00, otherwise 5.00",
  when the fee is calculated for a 2-hour stay, then the fee is 300 minor units and not 400.
* **PRICE-004** — Given a session created under pricing version 1, when the site moves to version 2
  and the fee is calculated for that session, then version 1 is used.
* **PRICE-010** — Given an exit completion, when it commits, then the session carries the fee
  snapshot matching the preview.
* **PAY-003, PAY-004** — Given a guard at a site whose accepted methods include "CASH", when the
  guard records a payment of 1.50 in cash with the reason "paid at the gate", then a `PAID`
  payment row exists with amount 150, currency "USD", the confirming guard, and the confirmation
  time.

### Failure

* **PRICE-003** — Given pricing version 1 exists, when an attempt is made to change the amount of
  version 1, then the request is rejected and version 1 is unchanged.
* **PRICE-006** — Given a pricing configuration that would produce a negative amount, then the
  configuration is rejected at creation.
* **PRICE-011** — Given a payment request with a body field "currency" equal to "KHR" for a "USD"
  site, then the request is rejected with 400.
* **PAY-002** — Given a payment request with method "CRYPTO" for a site that accepts only "CASH",
  then the request is rejected with 400.
* **PAY-005** — Given a session with a `PAID` payment, when a second `PAID` payment is recorded,
  then the response is 409 with `PAY_ALREADY_PAID` and the first payment is unchanged.
* **PAY-006** — Given a guard without `site.payments.exempt`, when the guard exempts a fee, then
  the response is 403.
* **PAY-007** — Given a `PAID` payment, when a void is attempted without a reason, then the request
  is rejected with 400 and the payment is still `PAID`.

### Abuse

* **PAY-005** — Given 10 concurrent `PAID` payment records for the same session, then exactly one
  payment row is `PAID` and the other attempts receive 409.
* **PAY-006** — Given a guard exempts 50 fees in a minute across sessions, then every exemption has
  a reason and an actor, and the exemptions are reported in the leakage figure.
* **PAY-007** — Given a voided payment, when the revenue report is generated, then the voided amount
  is shown separately and is not included in the collected total.
* **PAY-010** — Given 1000 payments, when the nightly consistency check runs, then it returns zero
  rows where `payments.site_id` differs from the session's site.
* **PAY-012** — Given a receipt screenshot uploaded to a ticket, when the payment is reviewed, then
  the payment status is unchanged and no automatic confirmation occurred.
* **PRICE-001** — Given a site with pricing versions 1, 2, and 3, when a new policy is created, then
  its version is 4.

## 8. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Is a grace period configurable per site, and what is the default? | Product owner | Phase 4 (current answer: configurable, default 0) |
| Q2 | Should the hourly rule support a partial first hour (pro-rata) as an option? | Product owner | Phase 5 |
| Q3 | What is the maximum tiered-policy complexity the UI should support? | Engineering | Phase 4 |
| Q4 | Should a "free parking" policy (amount 0) be a separate type? | Product owner | Phase 4 (current answer: a `FLAT` policy with amount 0) |

## 9. Related

* `specs/features/exit-verification/` — the payment requirement that gates the exit.
* `specs/features/admin-console/` — the revenue report.
* `specs/data/schema.md` — `pricing_policies` and `payments`.
* ADR-005 (pricing and payment MVP scope) · ADR-012 (currency and rounding).
