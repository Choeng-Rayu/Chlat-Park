# Entry QR and Guest Claim — Tasks

**Status:** In progress
**Requirement IDs:** CLAIM-001 … CLAIM-014

---

## Phase A — Data

- [ ] **T-A1 — `entry_claims` model and migration.**
  Satisfies: CLAIM-002, CLAIM-004, CLAIM-011, CLAIM-012.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `claimTokenHash` unique and indexed; `expiresAt`, `claimedAt`, `revokedAt`,
  `revokedReason`; the index on `expiresAt` supports the sweeper.

- [ ] **T-A2 — `tickets` model and migration, with the unique session constraint.**
  Satisfies: CLAIM-007.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `sessionId @unique`; `publicReference @unique`; `tokenHash @unique`; `plateDigest`;
  `TicketStatus` enum.

- [ ] **T-A3 — Token generator and hasher.**
  Satisfies: CLAIM-001, CLAIM-002.
  Files: `apps/api/src/modules/entry-claims/claim-token.service.ts`, `.spec.ts`.
  Notes: `crypto.randomBytes(32)` → base64url (43 chars); `sha256Hex(token)`; a unit test that
  1000 tokens are unique and that the hash is stable.

- [ ] **T-A4 — Public reference generator.**
  Satisfies: CLAIM-007.
  Files: `apps/api/src/modules/tickets/ticket-reference.service.ts`, `.spec.ts`.
  Notes: a human-typable reference (e.g. `7K3M-9QX4`) from an unambiguous alphabet (no O/0, I/1);
  collision-checked against the unique index with a bounded retry.

## Phase B — Issuance

- [ ] **T-B1 — Issue the claim inside the session-creation transaction.**
  Satisfies: CLAIM-002, CLAIM-004.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`,
  `apps/api/src/modules/entry-claims/entry-claims.service.ts`.
  Notes: the TTL comes from `site.settingsJson.entryClaimTtlSeconds`.

- [ ] **T-B2 — Return the raw token exactly once.**
  Satisfies: CLAIM-002, CLAIM-003.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: the raw token is present in the creation response and in no other response, ever.

- [ ] **T-B3 — Reissue.**
  Satisfies: CLAIM-011.
  Files: `apps/api/src/modules/entry-claims/entry-claims.service.ts`,
  `apps/api/src/modules/parking-sessions/parking-sessions.controller.ts`.
  Notes: `POST /parking-sessions/:sessionId/entry-claim` with `site.entry_qr.reissue`; revoke the
  old claim with reason `reissued` and issue a new one; only for a `PENDING_CLAIM` session.

- [ ] **T-B4 — Revoke on cancellation.**
  Satisfies: CLAIM-012.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: same transaction as the status change.

## Phase C — Claim

- [ ] **T-C1 — `POST /entry-claims/claim`.**
  Satisfies: CLAIM-005, CLAIM-006, CLAIM-009, CLAIM-010, CLAIM-013.
  Files: `apps/api/src/modules/entry-claims/entry-claims.controller.ts`, `entry-claims.service.ts`.
  Notes: `@Public()`; strict DTO (`token` only); the validation order from `design.md` §4.2; the
  transaction; the safe response.

- [ ] **T-C2 — Idempotent-looking error mapping.**
  Satisfies: CLAIM-005, CLAIM-006.
  Files: `apps/api/src/modules/entry-claims/entry-claims.service.ts`.
  Notes: 404 / 410 `EXPIRED` / 410 `REVOKED` / 410 `ALREADY_CLAIMED` / 409 `CONCURRENT_CLAIM`.

- [ ] **T-C3 — Concurrent-claim protection.**
  Satisfies: CLAIM-007, CLAIM-008.
  Files: `apps/api/src/modules/entry-claims/entry-claims.service.ts`.
  Notes: rely on the unique constraint; translate the violation into 409; also use the
  `row_version`-guarded session update.

- [ ] **T-C4 — Rate limiting on the claim route.**
  Satisfies: CLAIM-010.
  Files: `apps/api/src/common/guards/rate-limit.guard.ts`, `entry-claims.controller.ts`.
  Notes: 20/min per IP; 5/min per session (a session is identified by the claim's session id once
  resolved, and by the client address before that).

- [ ] **T-C5 — Audit rows.**
  Satisfies: CLAIM-003, CLAIM-011, CLAIM-012.
  Files: `apps/api/src/modules/entry-claims/entry-claims.service.ts`.
  Notes: `entry_claim.issued`, `entry_claim.claimed`, `entry_claim.reissued`,
  `entry_claim.revoked`, `entry_claim.rejected`; never the token.

## Phase D — Web

- [ ] **T-D1 — Entry QR panel on the guard dashboard.**
  Satisfies: CLAIM-014.
  Files: `apps/web/src/app/(guard)/site/[siteId]/entry/EntryQr.tsx`.
  Notes: renders the QR from the token; shows the plate, the site, and a countdown; a large
  "Reissue" button; the QR is not cached by the service worker.

- [ ] **T-D2 — Claim page.**
  Satisfies: CLAIM-010.
  Files: `apps/web/src/app/ticket/claim/page.tsx`, `ClaimButton.tsx`.
  Notes: the token is read from the URL fragment, moved into a POST body, and removed from the URL;
  `Referrer-Policy: no-referrer`; the button is disabled while submitting; distinct messages for
  expired / revoked / already claimed.

- [ ] **T-D3 — Auto-submit on the claim page.**
  Satisfies: CLAIM-009.
  Files: `apps/web/src/app/ticket/claim/page.tsx`.
  Notes: a single tap; the guest does not need to create an account.

## Phase E — Verification

- [ ] **T-E1 — Token service unit tests.**
  Satisfies: CLAIM-001, CLAIM-002.
  Files: `apps/api/src/modules/entry-claims/claim-token.service.spec.ts`.

- [ ] **T-E2 — Claim service unit tests.**
  Satisfies: CLAIM-005, CLAIM-006, CLAIM-009, CLAIM-013.
  Files: `apps/api/src/modules/entry-claims/entry-claims.service.spec.ts`.

- [ ] **T-E3 — Concurrency test.**
  Satisfies: CLAIM-007, CLAIM-008.
  Files: `apps/api/test/entry-claim.e2e-spec.ts`.
  Notes: fire two claims in parallel; assert one ticket.

- [ ] **T-E4 — Rate-limit and log-leak tests.**
  Satisfies: CLAIM-003, CLAIM-010.
  Files: `apps/api/test/entry-claim.e2e-spec.ts`.
  Notes: assert 429 after the limit; assert the token does not appear in the captured logs.
