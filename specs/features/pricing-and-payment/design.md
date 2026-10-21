# Pricing and Payment — Design

**Status:** In progress
**Requirement IDs:** PRICE-001 … PRICE-012, PAY-001 … PAY-012

---

## 1. Architecture

```
Owner console                          apps/api
────────────                           ───────────────────────────────────────────────
Create pricing policy ──POST /parking-sites/:siteId/pricing-policies──▶ PricingController.create
  FLAT / HOURLY / TIERED                      │  validate against the rule-type schema
  effectiveFrom                              │  version = (max version for the site) + 1
                                              │  insert a new row; never update
                                              ▼
                                          pricing_policies (immutable rows)

Exit screen                            apps/api
──────────                            ───────────────────────────────────────────────
Verify ticket ──POST /verification/exit──▶ VerificationService
                                             └─ PricingService.calculate(session, policy, now)
                                                  → { amountMinor, currency, policyVersion, breakdown }

Record payment ──POST /parking-sessions/:id/payments──▶ PaymentsController.record
  method + amount + reason                     │  validate the method against the site's accepted methods
                                               │  insert a `PAID` row (one per session)
                                               │  audit
                                               ▼
                                          payments (append-only; corrections are VOIDED)
```

## 2. Data model

```prisma
model PricingPolicy {
  id             String   @id @default(uuid()) @db.Uuid
  siteId         String   @db.Uuid
  version        Int
  ruleType       PricingRuleType
  configurationJson Json
  effectiveFrom  DateTime @db.Timestamptz(3)
  isActive       Boolean  @default(true)
  createdById    String?  @db.Uuid
  createdAt      DateTime @default(now()) @db.Timestamptz(3)

  site           ParkingSite @relation(fields: [siteId], references: [id])
  sessions       ParkingSession[]

  @@unique([siteId, version])
  @@index([siteId, effectiveFrom])
}

enum PricingRuleType { FLAT  HOURLY  TIERED }

model Payment {
  id                String   @id @default(uuid()) @db.Uuid
  sessionId         String   @db.Uuid
  siteId            String   @db.Uuid        // denormalized for reporting (PAY-010)
  amountMinor       Int
  currency          String
  method            PaymentMethod
  status            PaymentStatus @default(UNPAID)
  providerReference String?
  confirmedByGuardId String? @db.Uuid
  confirmedAt       DateTime? @db.Timestamptz(3)
  capturedAt        DateTime? @db.Timestamptz(3)
  exemptionReason   String?
  voidedReason      String?
  voidedById        String?  @db.Uuid
  reason            String?              // why this payment was recorded
  createdAt         DateTime @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime @updatedAt @db.Timestamptz(3)

  session           ParkingSession @relation(fields: [sessionId], references: [id])

  @@index([sessionId, status])
  @@index([siteId, capturedAt])
  @@index([status])
}

enum PaymentStatus { UNPAID  PENDING  PAID  FAILED  EXEMPT  VOIDED }
enum PaymentMethod { CASH  KHQR_MANUAL  OTHER_MANUAL }
```

### 2.1 The one-`PAID`-payment constraint

A session may have several payment rows (a correction, a re-record) but at most one `PAID`:

```sql
CREATE UNIQUE INDEX payments_one_paid_per_session
  ON payments (session_id)
  WHERE status = 'PAID';
```

A **partial** unique index. It permits any number of `VOIDED`, `FAILED`, or `PENDING` rows per
session while guaranteeing a single settled payment. This is the database-level guarantee behind
PAY-005 and it also settles the concurrency question: two simultaneous `PAID` inserts, one wins.

## 3. The pricing model

### 3.1 Rule configurations

```jsonc
// FLAT
{ "amountMinor": 150, "currency": "USD" }

// HOURLY
{ "rateMinor": 100, "perMinutes": 60, "graceMinutes": 10, "maxAmountMinor": 2000, "currency": "USD" }

// TIERED
{
  "currency": "USD",
  "tiers": [
    { "upToMinutes":  60, "amountMinor": 100 },
    { "upToMinutes": 240, "amountMinor": 300 },
    { "upToMinutes": null, "amountMinor": 500 }   // null = the catch-all band
  ]
}
```

Each rule type has its own Zod schema in `@chlat/contracts`
(`FlatPricingConfig`, `HourlyPricingConfig`, `TieredPricingConfig`), discriminated by `ruleType`.
An unknown key is rejected.

### 3.2 The calculation

```ts
// apps/api/src/modules/pricing/pricing.service.ts
calculate(session: ParkingSession, policy: PricingPolicy, now: Date): FeeBreakdown {
  if (!session.entryAt) throw new DomainError('PRICE_NO_ENTRY_TIME', 409);
  const durationMs = Math.max(0, now.getTime() - session.entryAt.getTime());
  const durationMinutes = Math.floor(durationMs / 60_000);

  let amountMinor: number;
  const cfg = policy.configurationJson;

  switch (policy.ruleType) {
    case 'FLAT':
      amountMinor = cfg.amountMinor;
      break;

    case 'HOURLY': {
      const billable = Math.max(0, durationMinutes - cfg.graceMinutes);
      const units = Math.ceil(billable / cfg.perMinutes);       // whole units, rounded up
      amountMinor = units * cfg.rateMinor;
      if (cfg.maxAmountMinor != null) amountMinor = Math.min(amountMinor, cfg.maxAmountMinor);
      break;
    }

    case 'TIERED': {
      const tier = cfg.tiers.find(t => t.upToMinutes == null || durationMinutes <= t.upToMinutes)!;
      amountMinor = tier.amountMinor;                           // one band, not a sum
      break;
    }
  }

  // One rounding step, at the end (PRICE-006)
  const roundedMinor = Math.max(0, roundHalfUp(amountMinor));
  return {
    amountMinor: roundedMinor,
    currency: cfg.currency,
    policyId: policy.id,
    policyVersion: policy.version,
    durationMinutes,
    breakdown: { ruleType: policy.ruleType, ... },
  };
}
```

### 3.3 Rounding (ADR-012)

* All amounts are integer minor units.
* Rounding is applied **once**, at the end of the calculation, **half-up** on the minor unit.
* The fee is never negative; the minimum is 0.
* Because the inputs are already integers and the intermediates are integer arithmetic, the
  "round half-up at the end" rule is exact — there is no accumulated float error. The rounding
  helper exists for the (rare) case where a rate is expressed in a major unit and converted.

```ts
export function roundHalfUp(minor: number): number {
  return Math.floor(minor + 0.5);
}
```

**USD (2 decimals) and KHR (0 decimals)** are both supported. KHR amounts are therefore whole
units, and a KHR configuration must have a `minorUnitFactor` of 1.

### 3.4 The effective policy

```sql
SELECT * FROM pricing_policies
WHERE site_id = $siteId AND is_active = true AND effective_from <= $now
ORDER BY version DESC
LIMIT 1;
```

A future-dated policy is simply not selected until its `effective_from` arrives (PRICE-012). The
previous policy stays effective until then; no job is required to swap them.

## 4. State transitions

### 4.1 The pricing policy

```
  (none) ──create(version N)──▶ SCHEDULED or EFFECTIVE
                                    │
                       effective_from arrives
                                    ▼
                               EFFECTIVE
                                    │
                    a newer policy is created ──▶ SUPERSEDED
```

| From | Event | To | Notes |
|---|---|---|---|
| — | create with `effective_from` in the future | SCHEDULED | Not selected by the effective-policy query until its date |
| — | create with `effective_from` now or in the past | EFFECTIVE | Selected by the query immediately |
| EFFECTIVE | a newer policy becomes effective | SUPERSEDED | The old policy is retained; it is never modified or deleted |
| SCHEDULED | `effective_from` arrives | EFFECTIVE | Automatically, by the selection query — no job is required |
| SCHEDULED | a newer policy is created before its date | SUPERSEDED | The scheduled policy is deactivated (`isActive = false`) |

**A policy is never edited.** There is no transition out of EFFECTIVE that changes its amount. A
price change is always a new row with a new version (PRICE-003).

**A session is bound to a policy at creation** and keeps that binding for its whole life
(PRICE-004). A policy being superseded does not change a historical session's price.

### 4.2 The payment

```
   (none) ──record as unpaid──────▶ UNPAID
      │                                 │
      ├──record cash, confirmed─────────┤──▶ PAID
      ├──record, not yet confirmed──────┤──▶ PENDING
      ├──record, failed─────────────────┤──▶ FAILED
      ├──exempt (reason, permission)───┤──▶ EXEMPT
      │                                 │
      └──void (reason, actor)───────────┴──▶ VOIDED   (from PAID, PENDING, FAILED, or EXEMPT)
```

| From | Event | To | Preconditions | Actor | Revenue effect |
|---|---|---|---|---|---|
| — | create a row | `UNPAID` | — | guard | none |
| `UNPAID` | the guard confirms the cash | `PAID` | The method is accepted at the site; a reason is given | guard with `site.payments.record` | **+amount** |
| `UNPAID` | the guard records but does not confirm | `PENDING` | A reason is given | guard | none |
| `UNPAID` | the guard records a failure | `FAILED` | A reason is given | guard | none (a count) |
| `UNPAID` | the fee is waived | `EXEMPT` | `site.payments.exempt`; a reason is given | owner / super admin (a guard with a reason) | none — **leakage** |
| `PAID` | a correction | `VOIDED` | An authorized actor; a reason is given | guard / owner | **−amount** |
| `PENDING` / `FAILED` / `EXEMPT` | a correction | `VOIDED` | The same | — | none |

**There is no transition out of `VOIDED`.** A voided payment is final. A corrected payment is
recorded as a **new row**, so the ledger shows both the mistake and the correction. This is what
makes the append-only history meaningful.

**The one-`PAID` invariant** is enforced by the partial unique index, not by the state machine —
so a concurrent second `PAID` fails at the database with a unique violation, which the service
translates into `409 PAY_ALREADY_PAID` (PAY-005).

### 4.3 The payment requirement

The requirement is a *derived* value, not a state. It is satisfied when:

```
  fee.amountMinor == 0                              → satisfied (nothing is owed)
  OR a "PAID" payment exists with amount >= fee       → satisfied
  OR an "EXEMPT" payment exists                      → satisfied
  otherwise                                          → not satisfied
```

`PENDING`, `FAILED`, `VOIDED`, and `UNPAID` never satisfy it (PAY-009, PAY-008, PAY-011). The
requirement is re-evaluated inside the exit-completion transaction, so a payment that is voided
between the verification and the completion blocks the exit.

### 4.4 The session's relationship to the payment

The session's own state machine is in `features/parking-session/`. The interaction is:

| The session status | A payment | The exit |
|---|---|---|
| `PENDING_CLAIM` | none | Impossible — no fee window |
| `ACTIVE` | `UNPAID` / `PENDING` / `FAILED` | Blocked — `EXIT_PAYMENT_REQUIRED` |
| `ACTIVE` | `PAID` / `EXEMPT` | Allowed |
| `EXIT_PENDING` | `PAID` / `EXEMPT` | Allowed — the completion re-checks under a lock |
| `COMPLETED` | any | The exit is already done; the fee snapshot is written |

## 5. Payment states

```
   (none) ──record as unpaid──────▶ UNPAID
      │
      ├──record cash, confirmed───▶ PAID       (confirmedByGuardId, confirmedAt, capturedAt)
      ├──record, not yet confirmed▶ PENDING
      ├──record, failed───────────▶ FAILED
      ├──exempt (reason)──────────▶ EXEMPT     (exemptionReason, authorizing actor)
      │
      └──void (reason, actor)─────▶ VOIDED     (from PAID, PENDING, FAILED, or EXEMPT)
```

| From | To | Trigger | Preconditions | Actor | Revenue effect |
|---|---|---|---|---|---|
| — | `UNPAID` | A payment row is created without a status | — | guard | none |
| `UNPAID` | `PAID` | The guard confirms the cash | The method is accepted at the site; a reason is given | guard with `site.payments.record` | **+amount** |
| `UNPAID` | `PENDING` | The guard records but does not confirm | A reason is given | guard | none |
| `UNPAID` | `FAILED` | The guard records a failure | A reason is given | guard | none (counted separately) |
| `UNPAID` | `EXEMPT` | The fee is waived | `site.payments.exempt`; a reason is given | owner / super admin (guard with a reason) | none — **leakage** |
| `PAID` | `VOIDED` | A correction | An authorized actor; a reason is given | guard / owner | **−amount** |
| `PENDING` / `FAILED` / `EXEMPT` | `VOIDED` | A correction | The same | — | none |

**There is no transition out of `VOIDED`.** A voided payment is final; a new payment is recorded
as a new row. This keeps the append-only history intact and makes the correction obvious in the
ledger.

### 5.1 The payment requirement

```ts
isSatisfied(session, fee): boolean {
  if (fee.amountMinor === 0) return true;                   // nothing is owed
  const paid = session.payments.find(p => p.status === 'PAID');
  if (paid) return paid.amountMinor >= fee.amountMinor;
  const exempt = session.payments.find(p => p.status === 'EXEMPT');
  return Boolean(exempt);
}
```

`PENDING`, `FAILED`, `VOIDED`, and `UNPAID` never satisfy the requirement (PAY-009, PAY-008).

## 6. Failure handling

| Failure | Response | Handling |
|---|---|---|
| Unknown rule type | 400 `VALIDATION_FAILED` | The configuration schema is discriminated |
| A non-integer amount | 400 `VALIDATION_FAILED` | Amounts are integers in minor units |
| A client-supplied currency | 400 `VALIDATION_FAILED` | The currency comes from the site/policy |
| A method the site does not accept | 400 `VALIDATION_FAILED` | The method set is the site's |
| A second `PAID` payment | 409 `PAY_ALREADY_PAID` | The partial unique index |
| A void without a reason | 400 `VALIDATION_FAILED` | The reason is mandatory |
| A fee with no `entry_at` | 409 `PRICE_NO_ENTRY_TIME` | A session that was never claimed has no fee |
| The pricing policy row is missing | 500 `INTERNAL_ERROR` | A session always stores its policy id; this indicates data corruption |
| The site's currency is not a supported code | 400 at site creation | The currency is validated up front |

## 7. Security considerations

| Threat | Control |
|---|---|
| The client sets the fee or the amount | The fee is computed server-side; the payment amount is validated against the computed fee (a guard may not collect less than the fee without an exemption) |
| The client sets the currency | The currency comes from the site / the policy |
| The client sets `PAID` without a reason | The reason is mandatory (PAY-003) |
| A guard quietly marking a payment as paid | The status change is audited with the actor, the amount, and the reason; the owner can see it in the report |
| A guard quietly voiding a payment to hide a mistake | The void is audited; `VOIDED` subtracts from revenue and is reported prominently |
| A guard exempting fees to favour a friend | The exemption requires the permission and a reason, and every exemption is reported as leakage |
| Money as a float | Integer minor units everywhere (PAY-001) |
| A negative fee | Clamped to 0 and rejected at configuration time |
| Price history being rewritten | Policies are immutable; a session keeps its policy version; the fee is snapshotted |

## 8. Observability

| Event | Where |
|---|---|
| `pricing.policy_created` | Audit log (site, version, rule type) |
| `payment.recorded` | Audit log (session, amount, method, status, reason) |
| `payment.voided` | Audit log (payment, original amount, actor, reason) |
| `payment.exempted` | Audit log (session, actor, reason) |
| `payment_conflict_total` | Metrics — a second `PAID` attempt (a double-charge risk) |
| `exempt_total{site}` | Metrics — the leakage signal |
| `voided_total{site}` | Metrics — the correction signal |
| `fee_amount_minor` | Histogram — the distribution of fees |

## 9. Alternatives considered

| Alternative | Why rejected |
|---|---|
| A single price field on the site | Changing the price would re-price history. Versioned policies fix that. |
| Pro-rata hourly billing | Rounding disputes at the gate. Whole units, rounded up, is explainable to a customer in one sentence. |
| Editing a pricing policy in place | The same policy id would then describe two different prices. |
| Editing a payment row in place | Silent edits are unauditable. `VOIDED` + a new row is explicit. |
| Float amounts in major units | Rounding drift. Minor units are exact. |
| A payment provider in the MVP | Scope. ADR-005 fixes manual cash for the MVP. |
| One payment row per session (updated in place) | It would erase the correction history. |
| Rounding at each step | Compounding error and confusing intermediate values. One rounding at the end. |
