# Pricing and Payment — Tasks

**Status:** In progress
**Requirement IDs:** PRICE-001 … PRICE-012, PAY-001 … PAY-012

---

## Phase A — Data

- [ ] **T-A1 — `pricing_policies` model and migration.**
  Satisfies: PRICE-001, PRICE-003.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `@@unique([siteId, version])`; `effectiveFrom`; `isActive`; the configuration is a JSON
  column validated by a discriminated Zod schema.

- [ ] **T-A2 — `payments` model and migration.**
  Satisfies: PAY-001, PAY-002, PAY-004, PAY-010.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `PaymentStatus` includes `VOIDED`; `siteId` is denormalized; `capturedAt`, `confirmedAt`,
  `exemptionReason`, `voidedReason`, `voidedById`, `reason`.

- [ ] **T-A3 — The partial unique index for one `PAID` payment per session.**
  Satisfies: PAY-005.
  Files: `apps/api/prisma/migrations/*/migration.sql`.
  Notes: `CREATE UNIQUE INDEX payments_one_paid_per_session ON payments(session_id) WHERE status =
  'PAID';` — a raw SQL step in the migration, documented for rollback.

- [ ] **T-A4 — Pricing configuration schemas.**
  Satisfies: PRICE-002.
  Files: `packages/contracts/src/pricing.ts`.
  Notes: `FlatPricingConfig`, `HourlyPricingConfig`, `TieredPricingConfig`; a discriminated union
  on `ruleType`; strict (unknown keys rejected).

## Phase B — Pricing

- [ ] **T-B1 — `PricingService.calculate`.**
  Satisfies: PRICE-005, PRICE-006, PRICE-007, PRICE-008, PRICE-011.
  Files: `apps/api/src/modules/pricing/pricing.service.ts`, `.spec.ts`.
  Notes: the algorithm from `design.md` §3.2; the rounding helper; the clamp to 0; the
  breakdown in the result.

- [ ] **T-B2 — The effective-policy lookup.**
  Satisfies: PRICE-012.
  Files: `apps/api/src/modules/pricing/pricing.service.ts`.
  Notes: the query from `design.md` §3.4; a future-dated policy is not selected.

- [ ] **T-B3 — `PricingService.createPolicy`.**
  Satisfies: PRICE-001, PRICE-003.
  Files: `apps/api/src/modules/pricing/pricing.service.ts`, `pricing.controller.ts`.
  Notes: the version is `(max version for the site) + 1`, computed inside a transaction with a row
  lock on the site; the previous policy is never updated.

- [ ] **T-B4 — `GET /parking-sites/:siteId/pricing-policies`.**
  Satisfies: PRICE-001.
  Files: `apps/api/src/modules/pricing/pricing.controller.ts`.
  Notes: `site.pricing.read`; the versions with their effective dates.

- [ ] **T-B5 — The fee preview in the verification response.**
  Satisfies: PRICE-009.
  Files: `apps/api/src/modules/verification/verification.service.ts`.
  Notes: the same `calculate` used by the snapshot writer; a test asserts they agree.

- [ ] **T-B6 — The fee snapshot at exit completion.**
  Satisfies: PRICE-010.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: written in the completion transaction from the same `calculate` result.

- [ ] **T-B7 — Store the policy id and version on the session at creation.**
  Satisfies: PRICE-004.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: resolved at creation from the effective policy.

## Phase C — Payments

- [ ] **T-C1 — `PaymentService.record`.**
  Satisfies: PAY-002, PAY-003, PAY-004, PAY-005, PAY-012.
  Files: `apps/api/src/modules/payments/payments.service.ts`, `.spec.ts`.
  Notes: the method must be in the site's accepted set; a reason is mandatory; the amount must be
  at least the computed fee unless the site requires no fee; the unique violation becomes
  `409 PAY_ALREADY_PAID`.

- [ ] **T-C2 — `PaymentService.exempt`.**
  Satisfies: PAY-006.
  Files: `apps/api/src/modules/payments/payments.service.ts`, `payments.controller.ts`.
  Notes: `site.payments.exempt`; a reason is mandatory; the authorizing actor is recorded; the row
  is `EXEMPT` with `exemptionReason`.

- [ ] **T-C3 — `PaymentService.void`.**
  Satisfies: PAY-007, PAY-008.
  Files: `apps/api/src/modules/payments/payments.service.ts`, `payments.controller.ts`.
  Notes: an authorized actor; a reason is mandatory; the row is updated to `VOIDED` with
  `voidedReason` and `voidedById`; the original amount is preserved; the row is never deleted.

- [ ] **T-C4 — `POST /parking-sessions/:sessionId/payments`.**
  Satisfies: PAY-003.
  Files: `apps/api/src/modules/payments/payments.controller.ts`.
  Notes: `site.payments.record`; the scope is resolved from the session.

- [ ] **T-C5 — `isSatisfied` — the payment requirement.**
  Satisfies: PAY-009, PAY-011.
  Files: `apps/api/src/modules/payments/payments.service.ts`.
  Notes: the algorithm from `design.md` §4.1; used by the exit completion.

- [ ] **T-C6 — `payments.site_id` denormalization and the nightly check.**
  Satisfies: PAY-010.
  Files: `apps/api/src/modules/payments/payments.service.ts`, `apps/api/scripts/consistency-check.ts`.
  Notes: the site id is copied from the session in the same transaction; the nightly script
  compares every payment's site to its session's site and pages on a mismatch.

## Phase D — Web

- [ ] **T-D1 — The fee preview panel.**
  Satisfies: PRICE-009, PRICE-011.
  Files: `apps/web/src/app/(guard)/site/[siteId]/exit/FeePanel.tsx`.
  Notes: the amount, the currency, the duration, the rule type, and the policy version; the
  breakdown is expandable.

- [ ] **T-D2 — The payment form.**
  Satisfies: PAY-002, PAY-003, PAY-012.
  Files: `apps/web/src/app/(guard)/site/[siteId]/exit/PaymentForm.tsx`.
  Notes: the method comes from the site's accepted methods; the amount defaults to the fee; a
  reason is required; an explicit "paid" / "not yet confirmed" choice; no automatic confirmation
  from a screenshot.

- [ ] **T-D3 — The void flow.**
  Satisfies: PAY-007.
  Files: `apps/web/src/app/(owner)/owner/sites/[siteId]/payments/`.
  Notes: a confirmation dialog; a mandatory reason; the voided payment is shown struck through with
  its reason.

- [ ] **T-D4 — Pricing policy editor.**
  Satisfies: PRICE-002, PRICE-003.
  Files: `apps/web/src/app/(owner)/owner/sites/[siteId]/pricing/page.tsx`.
  Notes: a form per rule type; the existing versions are listed read-only with their effective
  dates; a preview calculator for the owner.

## Phase E — Verification

- [ ] **T-E1 — Pricing unit tests.**
  Satisfies: PRICE-006, PRICE-007, PRICE-008.
  Files: `apps/api/src/modules/pricing/pricing.service.spec.ts`.
  Notes: flat, hourly (with a grace period, a cap, and a rounding-up boundary), tiered band
  selection, the zero-duration case, and the no-entry-time case.

- [ ] **T-E2 — Payment unit tests.**
  Satisfies: PAY-002, PAY-003, PAY-005, PAY-008, PAY-009, PAY-011.
  Files: `apps/api/src/modules/payments/payments.service.spec.ts`.

- [ ] **T-E3 — Concurrency test on the payment.**
  Satisfies: PAY-005.
  Files: `apps/api/test/payments.e2e-spec.ts`.
  Notes: 10 parallel `PAID` records — exactly one succeeds.

- [ ] **T-E4 — Pricing history stability test.**
  Satisfies: PRICE-004, PRICE-010.
  Files: `apps/api/test/pricing.e2e-spec.ts`.
  Notes: change the site's policy, then assert the historical session still reports the old fee.

- [ ] **T-E5 — Consistency check test.**
  Satisfies: PAY-010.
  Files: `apps/api/test/payments.e2e-spec.ts`.
  Notes: insert a deliberately mismatched row in a test transaction and assert the check finds it.
