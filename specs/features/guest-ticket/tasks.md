# Guest Ticket — Tasks

**Status:** In progress
**Requirement IDs:** TICKET-001 … TICKET-012

---

## Phase A — Data

- [ ] **T-A1 — `tickets` model and migration.**
  Satisfies: TICKET-001, TICKET-002, TICKET-007.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `sessionId @unique`, `publicReference @unique`, `tokenHash @unique`, `guestUserId`,
  `linkedAt`, `TicketStatus` enum.

- [ ] **T-A2 — Ticket token generator.**
  Satisfies: TICKET-002.
  Files: `apps/api/src/modules/tickets/ticket-token.service.ts`, `.spec.ts`.
  Notes: 16 random bytes (128 bits) → base64url (22 chars); SHA-256 hash for storage; the raw value
  is returned only at issuance.

- [ ] **T-A3 — Public reference generator.**
  Satisfies: TICKET-002, TICKET-003.
  Files: `apps/api/src/modules/tickets/ticket-reference.service.ts`, `.spec.ts`.
  Notes: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, formatted `XXXX-XXXX`; the lookup
  normalizes to uppercase and strips the dash; a bounded retry on the unique violation.

- [ ] **T-A4 — Ticket link model (`guestUserId`, `linkedAt`).**
  Satisfies: TICKET-009, TICKET-010.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.

## Phase B — Issuance and display

- [ ] **T-B1 — Issue the ticket inside the claim transaction.**
  Satisfies: TICKET-001, TICKET-002.
  Files: `apps/api/src/modules/entry-claims/entry-claims.service.ts`,
  `apps/api/src/modules/tickets/tickets.service.ts`.
  Notes: create the ticket with the reference and the token hash; return the raw token once.

- [ ] **T-B2 — The safe public payload builder.**
  Satisfies: TICKET-004.
  Files: `packages/contracts/src/tickets.ts`, `apps/api/src/modules/tickets/tickets.service.ts`.
  Notes: a strict DTO with exactly the allowed fields; an explicit "no extra fields" test.

- [ ] **T-B3 — `GET /tickets/:reference`.**
  Satisfies: TICKET-003, TICKET-004.
  Files: `apps/api/src/modules/tickets/tickets.controller.ts`.
  Notes: returns the display payload; the token is included only when the caller presents it (the
  claim flow or the owner's own page).

- [ ] **T-B4 — Revoke.**
  Satisfies: TICKET-007, TICKET-008.
  Files: `apps/api/src/modules/tickets/tickets.service.ts`, `tickets.controller.ts`.
  Notes: `site.ticket.verify` plus an owner-level permission; a reason is mandatory; the ticket row
  is updated, never deleted; the session is usually moved to `MANUAL_REVIEW`.

## Phase C — Linking

- [ ] **T-C1 — Link endpoint.**
  Satisfies: TICKET-009, TICKET-010.
  Files: `apps/api/src/modules/tickets/tickets.controller.ts`, `tickets.service.ts`.
  Notes: `POST /tickets/link` with the ticket token; requires `account.tickets.read`; the token
  hash must match the ticket; the ticket must not already belong to another account.

- [ ] **T-C2 — Link must not mutate the session or payments.**
  Satisfies: TICKET-010.
  Files: `apps/api/src/modules/tickets/tickets.service.ts`.
  Notes: only `guestUserId` and `linkedAt` are written; a test asserts every other field is
  unchanged.

- [ ] **T-C3 — Failed-link audit.**
  Satisfies: TICKET-009.
  Files: `apps/api/src/modules/audit/`.
  Notes: `ticket.link_failed` with the actor and the reference.

- [ ] **T-C4 — Account ticket history.**
  Satisfies: TICKET-011.
  Files: `apps/api/src/modules/tickets/tickets.controller.ts`, `tickets.service.ts`.
  Notes: `GET /account/tickets`; paginated; the display payload only; no tokens in the list.

## Phase D — Web

- [ ] **T-D1 — The ticket page.**
  Satisfies: TICKET-004, TICKET-005, TICKET-006.
  Files: `apps/web/src/app/ticket/[reference]/page.tsx`, `TicketCard.tsx`.
  Notes: a large QR; the reference in a large monospace font; the site, the plate, and the entry
  time; instructions in Khmer and English; no scrolling on a 360×640 viewport; the QR is rendered
  at a high error-correction level.

- [ ] **T-D2 — Storage hygiene.**
  Satisfies: TICKET-006.
  Files: `apps/web/src/app/ticket/[reference]/page.tsx`, the service worker registration.
  Notes: no token in browser storage; `Cache-Control: no-store` on the response; the QR image is
  not in the service-worker cache; the token is passed via a server-side prop, not a global.

- [ ] **T-D3 — "Save / screenshot" guidance.**
  Satisfies: TICKET-005.
  Files: `apps/web/src/app/ticket/[reference]/page.tsx`.
  Notes: a short instruction in both languages; a `beforeinstallprompt` affordance where the PWA is
  installable.

- [ ] **T-D4 — Optional registration prompt.**
  Satisfies: TICKET-009.
  Files: `apps/web/src/app/ticket/[reference]/page.tsx`, `LinkAccountPrompt.tsx`.
  Notes: the prompt never blocks the ticket; linking requires the token.

## Phase E — Verification

- [ ] **T-E1 — Reference and token generation tests.**
  Satisfies: TICKET-002.
  Files: `apps/api/src/modules/tickets/ticket-reference.service.spec.ts`,
  `ticket-token.service.spec.ts`.

- [ ] **T-E2 — Payload-shape test.**
  Satisfies: TICKET-004, TICKET-011.
  Files: `apps/api/test/tickets.e2e-spec.ts`.
  Notes: assert the exact key set of the payload; assert no token in the list response.

- [ ] **T-E3 — Linking tests.**
  Satisfies: TICKET-009, TICKET-010.
  Files: `apps/api/test/tickets.e2e-spec.ts`.
  Notes: link by reference alone fails; link by token succeeds; the session and payments are
  unchanged; a second account cannot steal a linked ticket.

- [ ] **T-E4 — Storage-hygiene test.**
  Satisfies: TICKET-006.
  Files: `apps/web/e2e/ticket-page.spec.ts` (Playwright).
  Notes: after loading the ticket page, assert no token in `localStorage`, `sessionStorage`, or
  IndexedDB.
