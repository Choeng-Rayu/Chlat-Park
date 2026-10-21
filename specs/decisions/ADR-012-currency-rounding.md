# ADR-012: Currency and Rounding

**Status:** Accepted (with deferred sub-decisions)
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** PRICE-006, PRICE-011, PAY-001

---

## Context

Money is the one data type where "close enough" is a bug. A parking fee of 1.499999 that rounds
differently in the preview, in the snapshot, and in the revenue report produces three different
numbers for the same stay, and the owner cannot reconcile them.

Three questions have to be answered before the pricing feature can be implemented:

1. **How is an amount stored?** Floating-point major units accumulate error: 0.1 + 0.2 ≠ 0.3 in
   binary floating point, and a parking lot that collects 500 000 small fees will accumulate a
   visible discrepancy.
2. **When is the rounding applied?** Rounding at each step compounds. Rounding once, at the end,
   does not.
3. **What is the rounding rule?** "Half-up" and "half-even" differ on exact halves, and the
   difference is visible in a report.

And a fourth question, specific to this product: **which currency?** The pilot may operate in
Cambodia, and the site owners will think in a currency they recognise. The plan's default is USD
with KHR possible per site.

## Decision

1. **Every amount is stored as an integer number of minor units** (`amount_minor Int`), together
   with an explicit `currency` string. No floating-point amount is stored or transmitted anywhere
   in the system.

2. **The currency is per site**, stored on `parking_sites.currency`, and it applies to every
   session, ticket, payment, and fee snapshot at that site. The site's currency is **immutable once
   the site has its first session** — changing it would make the stored minor-unit amounts
   meaningless.

3. **The MVP currencies are:**
   * **USD** — 2 minor digits (1 USD = 100 cents).
   * **KHR** — 0 minor digits (1 KHR = 1 riel; the amount is a whole number of riel).
   * **THB** — 2 minor digits, available for a site that needs it.

   The number of minor digits is a property of the currency, not a site setting.

4. **The rounding rule is half-up, applied exactly once, at the end of the fee calculation.**
   ```ts
   const roundedMinor = Math.max(0, Math.floor(amountMinor + 0.5));
   ```
   The intermediate calculations are integer arithmetic, so the result is exact; the rounding
   helper exists for the case where a rate is expressed in a major unit and converted.

5. **The fee is never negative, and its minimum is 0.** A negative amount is rejected at the
   configuration level and clamped at the calculation level.

6. **The rounding is applied once, not per tier, per hour, or per line item.** A tiered policy
   selects one band and uses that band's amount; the bands are never summed.

7. **The preview and the snapshot use the same function.** `PricingService.calculate(session,
   policy, now)` produces both. The preview shown to the guard and the amount written at exit
   completion are therefore the same computation, not two implementations that happen to agree.

8. **The fee snapshot is written at exit completion**, in the same transaction, so the historical
   revenue is stable against a later price change.

9. **The fee is computed from the server clock** — the window is `[entry_at, exit_at]`, both in
   UTC in the database and displayed in the site's timezone.

10. **The currency comes from the site, never from the client.** A client-supplied `currency` is
    rejected by the strict DTO.

11. **The minor-unit digit count travels with the currency**, so the formatting code cannot
    mis-render a KHR amount with two decimals.

### 11.1 A worked example

A site with currency **USD** and a `HOURLY` policy of `rateMinor: 100` (1.00 per hour),
`perMinutes: 60`, `graceMinutes: 10`, `maxAmountMinor: 2000` (a 20.00 cap).

| Stay | Duration | Billable after the grace | Units (rounded up) | Fee (minor) | Fee (USD) |
|---|---|---|---|---|---|
| 5 minutes | 5 | 0 | 0 | 0 | $0.00 |
| 10 minutes | 10 | 0 | 0 | 0 | $0.00 |
| 11 minutes | 11 | 1 | 1 | 100 | $1.00 |
| 70 minutes | 70 | 60 | 1 | 100 | $1.00 |
| 71 minutes | 71 | 61 | 2 | 200 | $2.00 |
| 25 hours | 1500 | 1490 | 25 | 2500 → capped 2000 | $20.00 |

The rounding happens once, at the end, and it is a whole-unit rounding (a whole hour), not a
half-cent rounding.

## Consequences

### Positive

* **The arithmetic is exact.** Integer minor units have no representation error. The stored amount
  is exactly the amount owed.
* **The preview and the charge cannot diverge.** One function, two call sites.
* **The history is stable.** A price change does not re-price the past, because the snapshot is
  written at the completion.
* **The rounding is explainable to a customer.** "We bill whole hours, rounded up" is one sentence.
  "We bill pro-rata with half-even rounding to the cent" is not.
* **The KHR case is handled correctly.** A zero-decimal currency is a property of the currency, so
  a KHR site never renders 1500 riel as 15.00.
* **The fee is never negative**, so a misconfigured policy cannot produce a credit.

### Negative

* **The whole-unit rounding is unfavourable for very short stays.** A rider who parks for one
  minute past the grace period is billed a whole hour. This is standard in parking and is
  explainable, but it is a source of complaints.
* **A currency change is effectively permanent.** The site's currency is immutable after the first
  session. A site that starts in USD and wants KHR must create a new site (or wait for the
  sessions to be removed, which the retention policy prevents).
* **The minor-unit digit count must be kept in step with the currency list.** A currency added
  without its digit count would render incorrectly. A test asserts every supported currency has a
  digit count.
* **The integer representation is less readable in the database.** A reader must know that 150 is
  1.50, not 150. The UI and the reports always format it.
* **Multi-currency reporting is not supported.** A report across two sites with different
  currencies is rejected rather than converted. There is no exchange rate in the system, and
  inventing one would be worse than refusing.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | Should the hourly rule support a pro-rata partial unit as a site option? | Some sites with very short stays would want it. The whole-unit rule is the current answer. | Phase 5 |
| D2 | Is a per-site currency override needed, or only per platform? | Per site is the current answer, because the currency is a site-level business fact. | Settled |
| D3 | Which exchange rate source would be used if multi-currency reporting is ever needed? | There is none, and none is planned. A report across currencies is rejected. | Deferred |
| D4 | Should the displayed fee include the site currency symbol or a code? | The current answer: the locale's standard currency format, with the code in the tooltip and in the audit. | Phase 4 |
| D5 | Should there be a maximum fee, or is it only a per-policy option? | The `maxAmountMinor` field exists in the hourly configuration. The flat and tiered rules have no cap in the MVP. | Phase 5 |
| D6 | Is the tax treatment (a VAT-inclusive price) in scope? | Not in the MVP. The fee is a single amount. | Deferred |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Floating-point major units | 0.1 + 0.2 ≠ 0.3. The error accumulates over thousands of sessions and produces a report that does not reconcile. |
| Storing the amount as a decimal string | Correct, but it makes every arithmetic operation a parse and a string operation, and it pushes the rounding into string manipulation. The integer is simpler and exact. |
| Storing the amount in the smallest unit of a single global currency | A site in KHR would have to convert, and the conversion needs a rate. |
| A float column with a fixed-point convention | Same as the float problem, with extra ceremony. |
| Rounding at each step (per hour, per tier) | The error compounds, and the intermediate values are confusing. |
| Rounding half-even (banker's rounding) | It is defensible but it is harder to explain, and it produces a different answer from what most people expect for a price. Half-up matches the commercial expectation. |
| Pro-rata hourly billing by default | More accurate, and much harder to explain at the gate. It could be a per-site option later. |
| A platform-level currency with a per-site override | The currency is a business fact about the site, and it appears in every amount. Per site is the natural home. |
| Supporting multi-currency reporting with a rate table | A rate table is a new data source with its own accuracy and staleness problems, and the pilot does not need it. A report across currencies is rejected instead. |
| Rounding the fee to a "nice" number (e.g. the nearest 0.50) | A rounding rule that is not a rounding rule. |

## Related

* `specs/features/pricing-and-payment/` — the requirements and the calculation.
* `specs/data/schema.md` §7 — the money columns.
* ADR-005 — the pricing and payment scope.
* `specs/architecture/rbac-design.md` §9 — the revenue queries that read the minor units.
