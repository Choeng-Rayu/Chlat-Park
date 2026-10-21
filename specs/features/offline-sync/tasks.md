# Offline Sync — Tasks

**Status:** Deferred
**Requirement IDs:** SYNC-001 … SYNC-012

> These tasks belong to **Phase 6**. They are listed so the work is planned, not because the MVP
> depends on them. Do not start them before the local authority design and hardware are approved
> (ADR-003, open questions Q1 and Q2).

## Phase A — Decisions and hardware

- [ ] **T-A1 — Approve the local authority deployment model.**
  Satisfies: SYNC-001.
  Files: `specs/decisions/ADR-003-offline-authority.md` (update the Deferred items).
  Notes: hardware, placement, and the number of authorities per site.

- [ ] **T-A2 — Define the local service's data ownership.**
  Satisfies: SYNC-009.
  Files: `specs/architecture/offline-architecture.md` (update).
  Notes: which tables are local, which are central, and the reconciliation rules.

## Phase B — Event contract

- [ ] **T-B1 — The event schema.**
  Satisfies: SYNC-001.
  Files: `packages/contracts/src/sync.ts`.
  Notes: the strict Zod schema for the batch and the event; the schema version.

- [ ] **T-B2 — The canonical serialization and the integrity signature.**
  Satisfies: SYNC-001, SYNC-002.
  Files: `packages/contracts/src/sync-canonical.ts`.
  Notes: a deterministic JSON serialization; the HMAC over the canonical body.

- [ ] **T-B3 — The `sync_events` table (central).**
  Satisfies: SYNC-003, SYNC-007.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `eventId` unique; the status enum; the conflict details.

- [ ] **T-B4 — The local outbox table.**
  Satisfies: SYNC-009.
  Files: the local service's schema.
  Notes: written in the same transaction as the state change; a durability test.

## Phase C — Central ingestion

- [ ] **T-C1 — The authority authentication.**
  Satisfies: SYNC-002.
  Files: `apps/api/src/modules/sync/authority.service.ts`.
  Notes: a per-site secret; the HMAC check; a constant-time comparison.

- [ ] **T-C2 — `POST /sync/events`.**
  Satisfies: SYNC-002, SYNC-003, SYNC-005, SYNC-006.
  Files: `apps/api/src/modules/sync/sync.controller.ts`, `sync.service.ts`.
  Notes: the pipeline from `design.md` §4; the per-event statuses.

- [ ] **T-C3 — The event applier.**
  Satisfies: SYNC-004, SYNC-005.
  Files: `apps/api/src/modules/sync/sync-applier.service.ts`.
  Notes: it must reuse the online transition table; one transition per event type; a transactional
  apply.

- [ ] **T-C4 — The conflict rule and the reconciliation queue.**
  Satisfies: SYNC-007.
  Files: `apps/api/src/modules/sync/sync.service.ts`, `apps/api/src/modules/admin/`.
  Notes: `CONFLICT` events are stored with both states; a reconciliation screen lists them; a
  human resolves them.

## Phase D — Local service

- [ ] **T-D1 — The local API.**
  Satisfies: SYNC-009.
  Files: the local service.
  Notes: it reuses the domain services with a local database; the same rules, the same transitions.

- [ ] **T-D2 — The sync worker.**
  Satisfies: SYNC-003, SYNC-008.
  Files: the local service.
  Notes: exponential backoff with jitter; the outbox is drained only on `accepted`/`duplicate`.

- [ ] **T-D3 — The restart recovery.**
  Satisfies: SYNC-010.
  Files: the local service.
  Notes: the outbox is intact after a kill; the worker resumes; the health view reports the backlog.

- [ ] **T-D4 — The health and sync status.**
  Satisfies: SYNC-010.
  Files: the local service, `apps/web/src/app/(guard)/`.
  Notes: the mode, the backlog depth, and the last successful sync time.

## Phase E — Offline tickets and keys

- [ ] **T-E1 — The signed offline ticket payload.**
  Satisfies: SYNC-011.
  Files: `packages/contracts/src/offline-ticket.ts`.
  Notes: the payload from `design.md` §5; the canonical serialization; the signature.

- [ ] **T-E2 — The offline verification path.**
  Satisfies: SYNC-011.
  Files: the local service.
  Notes: the signature check, the expiry check, and the local session-state check.

- [ ] **T-E3 — The key distribution and rotation.**
  Satisfies: SYNC-011.
  Files: the local service, the key administration in the admin console.
  Notes: verification keys only; the `kid`; the rotation window; the revocation path.

- [ ] **T-E4 — The revocation limitation in the UI.**
  Satisfies: SYNC-012.
  Files: `apps/web/src/app/(guard)/`.
  Notes: the UI states that revocation cannot be known while disconnected.

## Phase F — Verification (real hardware)

- [ ] **T-F1 — A real disconnection test.**
  Satisfies: SYNC-001 … SYNC-010.
  Notes: a physical network disconnection of the site — **not** a mocked failure.

- [ ] **T-F2 — A restart and recovery test.**
  Satisfies: SYNC-010.
  Notes: kill the local service mid-shift; verify the outbox and the resumed sync.

- [ ] **T-F3 — Duplicate, out-of-order, and conflict tests.**
  Satisfies: SYNC-003, SYNC-006, SYNC-007, SYNC-008.
  Notes: the same batch submitted 10 times; events delivered in reverse order; a deliberately
  conflicting event.

- [ ] **T-F4 — Key rotation test.**
  Satisfies: SYNC-011.
  Notes: rotate the key; the old key still verifies until `notAfter`; the new key verifies
  immediately.
