# Parking Session — Tasks

**Status:** In progress
**Requirement IDs:** SESSION-001 … SESSION-014

---

## Phase A — Data

- [ ] **T-A1 — `parking_sessions` model and migration.**
  Satisfies: SESSION-001, SESSION-004, SESSION-005, SESSION-013, SESSION-014.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: all fields from `design.md` §2 including `plate_digest`, `fee_amount_minor`,
  `fee_currency`, `row_version`; the indexes from §2.2.

- [ ] **T-A2 — `SessionStatus` enum and the transition table.**
  Satisfies: SESSION-008.
  Files: `apps/api/src/modules/parking-sessions/session-state-machine.ts`, `.spec.ts`.
  Notes: a pure function; an exhaustive unit test over every (from, to) pair.

- [ ] **T-A3 — `PlateNormalizer` (ADR-007).**
  Satisfies: SESSION-004.
  Files: `packages/contracts/src/plate.ts`, `apps/api/src/modules/parking-sessions/plate-normalizer.ts`.
  Notes: trim, uppercase, collapse internal whitespace, strip spaces and hyphens; preserve Khmer and
  Latin letters and digits verbatim; never transliterate; empty result → validation error.

- [ ] **T-A4 — `PlateDigestService`.**
  Satisfies: SESSION-005.
  Files: `apps/api/src/modules/parking-sessions/plate-digest.service.ts`, `.spec.ts`.
  Notes: `HMAC-SHA256(pepper, normalized)` hex-encoded; the pepper comes from the environment;
  a missing pepper must fail fast at boot.

## Phase B — Creation

- [ ] **T-B1 — `CreateSessionDto` (strict schema).**
  Satisfies: SESSION-003.
  Files: `packages/contracts/src/sessions.ts`.
  Notes: only `plateId` (and optionally a client reference) are accepted; `status`, `siteId`,
  `entryAt`, `fee` are not part of the schema, so they are rejected with 400.

- [ ] **T-B2 — `ParkingSessionsService.create`.**
  Satisfies: SESSION-001, SESSION-002, SESSION-003, SESSION-004, SESSION-005.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`, `.spec.ts`.
  Notes: transaction wraps the session, the entry claim, and the audit row; the duplicate-active
  check is inside the same transaction; the pricing policy is resolved and stored.

- [ ] **T-B3 — `ParkingSessionsController.create`.**
  Satisfies: SESSION-001, SESSION-002.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.controller.ts`.
  Notes: `POST /parking-sites/:siteId/sessions` with `@RequirePermissions('site.sessions.create')`;
  the site is resolved from the route param and scope-checked.

- [ ] **T-B4 — `GET /parking-sites/:siteId/sessions` (list).**
  Satisfies: SESSION-011.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.controller.ts`, `.service.ts`.
  Notes: filters `status`, `from`, `to`; pagination with `limit`/`cursor`; a stable sort by
  `createdAt DESC, id`.

- [ ] **T-B5 — `GET /parking-sessions/:sessionId` (read).**
  Satisfies: SESSION-011.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.controller.ts`.
  Notes: `site.sessions.read`; the scope check uses the loaded session's site.

## Phase C — Transitions

- [ ] **T-C1 — `activate` (manual).**
  Satisfies: SESSION-006, SESSION-009.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`, `.spec.ts`.
  Notes: only from `PENDING_CLAIM`; sets `entry_at = now()`; audit row with the actor and the
  trigger `manual`.

- [ ] **T-C2 — `cancel`.**
  Satisfies: SESSION-009, SESSION-010.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`, `.spec.ts`.
  Notes: only from `PENDING_CLAIM`; revokes the pending entry claim in the same transaction.

- [ ] **T-C3 — `requestExit` (→ `EXIT_PENDING`).**
  Satisfies: SESSION-008.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: implemented together with the exit-verification feature (T-B of that feature).

- [ ] **T-C4 — `completeExit` (→ `COMPLETED`) with the fee snapshot.**
  Satisfies: SESSION-012, SESSION-013, SESSION-014.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: `SELECT … FOR UPDATE` on the session; re-check the status, the payment requirement, and
  the ticket; write `fee_amount_minor` and `fee_currency`; increment `row_version`; the audit row
  is in the same transaction.

- [ ] **T-C5 — `abortExit` (`EXIT_PENDING → ACTIVE`).**
  Satisfies: SESSION-008.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.

- [ ] **T-C6 — Review cases: open and resolve.**
  Satisfies: SESSION-008, SESSION-009.
  Files: `apps/api/src/modules/parking-sessions/review-cases.service.ts`, `review-case.model` in the
  Prisma schema.
  Notes: a reason is mandatory; resolution targets `ACTIVE`, `EXIT_PENDING`, or `COMPLETED`.

## Phase D — Web

- [ ] **T-D1 — Plate entry screen.**
  Satisfies: SESSION-004.
  Files: `apps/web/src/app/(guard)/site/[siteId]/entry/page.tsx`, `PlateInput.tsx`.
  Notes: the normalization preview is shown before the guard confirms ("AB-123" → "AB123"); the
  guard can correct the value.

- [ ] **T-D2 — Session list for the site.**
  Satisfies: SESSION-011.
  Files: `apps/web/src/app/(guard)/site/[siteId]/sessions/page.tsx`.
  Notes: filters by status; the list refreshes after an entry.

- [ ] **T-D3 — Manual activation and cancellation actions.**
  Satisfies: SESSION-009.
  Files: `apps/web/src/app/(guard)/site/[siteId]/sessions/SessionActions.tsx`.
  Notes: a confirmation dialog for cancellation; the reason is optional for cancel and required
  for a review.

## Phase E — Verification

- [ ] **T-E1 — Transition table unit test.**
  Satisfies: SESSION-008.
  Files: `apps/api/src/modules/parking-sessions/session-state-machine.spec.ts`.

- [ ] **T-E2 — Normalization unit test.**
  Satisfies: SESSION-004.
  Files: `apps/api/src/modules/parking-sessions/plate-normalizer.spec.ts`.
  Notes: Khmer plates, Latin plates, mixed separators, leading/trailing whitespace, an empty
  result, and a plate that is only separators.

- [ ] **T-E3 — Concurrency test on exit completion.**
  Satisfies: SESSION-012.
  Files: `apps/api/test/parking-session.e2e-spec.ts`.
  Notes: two concurrent completions — exactly one succeeds.

- [ ] **T-E4 — Transaction rollback test.**
  Satisfies: SESSION-002.
  Files: `apps/api/test/parking-session.e2e-spec.ts`.
  Notes: force the entry-claim insert to fail; assert no session row exists.
