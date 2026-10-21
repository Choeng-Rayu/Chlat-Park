# Exit Verification — Tasks

**Status:** In progress
**Requirement IDs:** EXIT-001 … EXIT-016

---

## Phase A — Data

- [ ] **T-A1 — `review_cases` model and migration.**
  Satisfies: EXIT-011, EXIT-012.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `ReviewCategory`, `ReviewStatus`; the site id is denormalized for the review list.

- [ ] **T-A2 — The verification result contract.**
  Satisfies: EXIT-002, EXIT-004.
  Files: `packages/contracts/src/verification.ts`.
  Notes: a strict Zod schema for `{ verdict, facts }`; the verdict is a closed union of exactly the
  nine allowed values; the facts object is optional per the verdict (see `design.md` §3.1).

## Phase B — Verification

- [ ] **T-B1 — `VerificationService.resolveTicket`.**
  Satisfies: EXIT-001.
  Files: `apps/api/src/modules/verification/verification.service.ts`.
  Notes: by token hash (indexed unique lookup) or by normalized reference; a case-insensitive
  reference lookup.

- [ ] **T-B2 — `VerificationService.verify`.**
  Satisfies: EXIT-001, EXIT-002, EXIT-003, EXIT-004, EXIT-005.
  Files: `apps/api/src/modules/verification/verification.service.ts`, `.spec.ts`.
  Notes: implement the precedence from `design.md` §3.1; compute the facts before the payment and
  plate checks; withhold the facts for the verdicts listed in the design.

- [ ] **T-B3 — `POST /verification/exit`.**
  Satisfies: EXIT-001, EXIT-016.
  Files: `apps/api/src/modules/verification/verification.controller.ts`.
  Notes: `@RequirePermissions('site.ticket.verify')`; the scope is resolved from the loaded
  session; the rate limit is 60/min per guard.

- [ ] **T-B4 — The fee preview in the verification facts.**
  Satisfies: EXIT-004.
  Files: `apps/api/src/modules/verification/verification.service.ts`.
  Notes: use the pricing service with the session's own pricing policy; include the policy version.

- [ ] **T-B5 — The observed-plate check.**
  Satisfies: EXIT-005.
  Files: `apps/api/src/modules/verification/verification.service.ts`.
  Notes: normalize the observed plate with the same normalizer; compare to
  `plateIdNormalized`; return `PLATE_MISMATCH` with the expected plate.

## Phase C — Completion

- [ ] **T-C1 — `ParkingSessionsService.completeExit`.**
  Satisfies: EXIT-006, EXIT-007, EXIT-009, EXIT-014.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`, `.spec.ts`.
  Notes: `SELECT … FOR UPDATE`; re-check the status, the ticket, and the payment; write the fee
  snapshot; increment `row_version`; the audit row is in the same transaction.

- [ ] **T-C2 — `POST /parking-sessions/:sessionId/exit/complete`.**
  Satisfies: EXIT-006, EXIT-016.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.controller.ts`.
  Notes: `@RequirePermissions('site.exit.complete')`; honour an `Idempotency-Key`; the rate limit
  is 20/min per guard.

- [ ] **T-C3 — `requestExit` and `abortExit`.**
  Satisfies: EXIT-006.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: `ACTIVE → EXIT_PENDING` and `EXIT_PENDING → ACTIVE`.

- [ ] **T-C4 — `POST /parking-sessions/:sessionId/manual-review`.**
  Satisfies: EXIT-011.
  Files: `apps/api/src/modules/parking-sessions/review-cases.service.ts`,
  `parking-sessions.controller.ts`.
  Notes: a reason is required; the session moves to `MANUAL_REVIEW`; the case is created.

- [ ] **T-C5 — `POST /parking-sessions/:sessionId/resolve-review`.**
  Satisfies: EXIT-012.
  Files: `apps/api/src/modules/parking-sessions/review-cases.service.ts`.
  Notes: `site.review.resolve`; the target must be `ACTIVE`, `EXIT_PENDING`, or `COMPLETED`; a
  reason is required; the before/after states are audited.

- [ ] **T-C6 — Plate-based active-session search.**
  Satisfies: EXIT-013.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`,
  `parking-sessions.controller.ts`.
  Notes: `GET /parking-sites/:siteId/sessions/search?plate=…`; the site is scope-checked; only
  active sessions are returned.

## Phase D — Audit

- [ ] **T-D1 — Verification and completion audit rows.**
  Satisfies: EXIT-015.
  Files: `apps/api/src/modules/verification/`, `apps/api/src/modules/parking-sessions/`.
  Notes: `exit.verified`, `exit.requested`, `exit.completed`, `exit.aborted`, `exit.refused`.

- [ ] **T-D2 — Review audit rows.**
  Satisfies: EXIT-011, EXIT-012.
  Files: `apps/api/src/modules/parking-sessions/review-cases.service.ts`.
  Notes: `review.opened`, `review.resolved` with the before/after statuses.

## Phase E — Web

- [ ] **T-E1 — The exit screen.**
  Satisfies: EXIT-001, EXIT-004.
  Files: `apps/web/src/app/(guard)/site/[siteId]/exit/page.tsx`, `ExitPanel.tsx`.
  Notes: a camera-based scanner where the browser supports it, plus a manual reference field; the
  facts panel shows the plate large, the entry time, the duration, the fee, the policy version, the
  payment state, and the session state.

- [ ] **T-E2 — Verdict presentation.**
  Satisfies: EXIT-002, EXIT-005.
  Files: `apps/web/src/app/(guard)/site/[siteId]/exit/VerdictBadge.tsx`.
  Notes: a high-contrast badge with an icon and text — never colour alone; Khmer and English
  labels; the expected plate is shown in a distinct colour and size for a mismatch.

- [ ] **T-E3 — The physical plate check prompt.**
  Satisfies: EXIT-005.
  Files: `apps/web/src/app/(guard)/site/[siteId]/exit/page.tsx`.
  Notes: a "the plate on the bike matches" checkbox that must be ticked before Authorize Exit is
  enabled.

- [ ] **T-E4 — Authorize Exit and its confirmation.**
  Satisfies: EXIT-006.
  Files: `apps/web/src/app/(guard)/site/[siteId]/exit/page.tsx`.
  Notes: a confirmation dialog naming the plate and the amount; the button is disabled while
  submitting; a double submission is prevented.

- [ ] **T-E5 — Manual review dialog.**
  Satisfies: EXIT-011, EXIT-012.
  Files: `apps/web/src/app/(guard)/site/[siteId]/exit/ManualReviewDialog.tsx`.
  Notes: a required reason with a category; the resolution options for an owner.

## Phase F — Verification

- [ ] **T-F1 — Verdict precedence unit test.**
  Satisfies: EXIT-002, EXIT-003.
  Files: `apps/api/src/modules/verification/verification.service.spec.ts`.
  Notes: one case per verdict; the precedence order is asserted.

- [ ] **T-F2 — Concurrency test.**
  Satisfies: EXIT-008.
  Files: `apps/api/test/exit.e2e-spec.ts`.
  Notes: two parallel completions — one success, one 409, one completion audit row.

- [ ] **T-F3 — Authorization tests.**
  Satisfies: EXIT-010, EXIT-012, EXIT-013.
  Files: `apps/api/test/exit.e2e-spec.ts`.
  Notes: a guard from another site; a guard without `site.payments.exempt`; a guard without
  `site.review.resolve`.

- [ ] **T-F4 — E2E happy path.**
  Satisfies: EXIT-001, EXIT-006, EXIT-014.
  Files: `apps/web/e2e/guard-exit.spec.ts` (Playwright).
  Notes: create → claim → verify → pay → complete, asserting the audit trail.
