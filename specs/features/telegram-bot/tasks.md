# Telegram Bot — Tasks

**Status:** Planned (P1)
**Requirement IDs:** TG-001 … TG-012

---

> These tasks are **not** part of the MVP critical path. They may be implemented in parallel with
> Phase 5, but the MVP must not depend on them.

## Phase A — Module and transport

- [ ] **T-A1 — `TelegramModule` skeleton inside `apps/api`.**
  Satisfies: TG-001.
  Files: `apps/api/src/modules/telegram/telegram.module.ts`, `telegram.controller.ts`.
  Notes: no business logic; the module wires the webhook to the domain services.

- [ ] **T-A2 — Environment variables.**
  Satisfies: TG-004.
  Files: `apps/api/src/config/env.validation.ts`.
  Notes: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`; both optional; the module is not
  registered when they are absent.

- [ ] **T-A3 — The webhook endpoint.**
  Satisfies: TG-002, TG-011.
  Files: `apps/api/src/modules/telegram/telegram.controller.ts`.
  Notes: `@Public()`; a size limit; the secret-token check; a body-shape check; the responses are
  200/400/401/413 as specified.

- [ ] **T-A4 — `TelegramUpdate` dedupe table.**
  Satisfies: TG-003.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `updateId` as the primary key; the insert's unique violation is the dedupe mechanism.

- [ ] **T-A5 — `TelegramClient`.**
  Satisfies: TG-004.
  Files: `apps/api/src/modules/telegram/telegram.client.ts`.
  Notes: a thin HTTP client for `sendMessage`, `sendPhoto`, `setWebhook`; the token is read from the
  environment and never logged; errors are mapped to internal types.

## Phase B — Commands

- [ ] **T-B1 — The update router.**
  Satisfies: TG-001, TG-003.
  Files: `apps/api/src/modules/telegram/telegram-update.handler.ts`.
  Notes: the dedupe insert first; then the routing by command.

- [ ] **T-B2 — `/start <token>` — the claim.**
  Satisfies: TG-001, TG-005.
  Files: `apps/api/src/modules/telegram/handlers/start.handler.ts`.
  Notes: calls `EntryClaimsService.claim(token)` — the same service the web app uses; the failure
  messages map to the same error codes.

- [ ] **T-B3 — `/ticket` — re-send the last ticket.**
  Satisfies: TG-006.
  Files: `apps/api/src/modules/telegram/handlers/ticket.handler.ts`.
  Notes: the chat state holds the reference; the display comes from `TicketsService`.

- [ ] **T-B4 — The QR image.**
  Satisfies: TG-007.
  Files: `apps/api/src/modules/telegram/telegram-qr.service.ts`.
  Notes: render the QR of the ticket token only; send it as a photo with a caption.

- [ ] **T-B5 — `/link` and the code confirmation.**
  Satisfies: TG-008.
  Files: `apps/api/src/modules/telegram/handlers/link.handler.ts`,
  `apps/api/src/modules/users/telegram-link.service.ts`.
  Notes: the website generates the code; the bot confirms it; the code is hashed, single-use, and
  expires in 10 minutes; the bot never asks for a password.

- [ ] **T-B6 — The chat state.**
  Satisfies: TG-008.
  Files: `apps/api/src/modules/telegram/telegram-chat-state.service.ts`.
  Notes: a small per-chat store of the last ticket reference; a TTL (see the open question Q4).

- [ ] **T-B7 — `/help` and `/language`.**
  Satisfies: TG-010.
  Files: `apps/api/src/modules/telegram/handlers/`.

## Phase C — Messages and audit

- [ ] **T-C1 — The `tg.*` message namespace.**
  Satisfies: TG-006, TG-009, TG-010.
  Files: `packages/i18n/messages/en.json`, `km.json`.
  Notes: every failure case has a message key; the messages are identical in meaning to the web
  app's.

- [ ] **T-C2 — The audit channel.**
  Satisfies: TG-012.
  Files: `apps/api/src/modules/audit/`.
  Notes: the audit metadata includes `channel: 'telegram'`; the same `ticket.issued` action as the
  web channel.

- [ ] **T-C3 — The error mapper.**
  Satisfies: TG-009.
  Files: `apps/api/src/modules/telegram/telegram-error.mapper.ts`.
  Notes: a domain error → a message key; an unknown error → `service_unavailable`; the raw error
  is logged, never sent.

## Phase D — Verification

- [ ] **T-D1 — Webhook tests.**
  Satisfies: TG-002, TG-003, TG-011.
  Files: `apps/api/test/telegram.e2e-spec.ts`.
  Notes: an invalid secret; a duplicate `update_id`; an oversized body; a malformed body.

- [ ] **T-D2 — Claim parity test.**
  Satisfies: TG-001, TG-005.
  Files: `apps/api/test/telegram.e2e-spec.ts`.
  Notes: the same fixture claimed through the web endpoint and through the bot produces the same
  ticket, the same session state, and the same error codes.

- [ ] **T-D3 — Log-leak test.**
  Satisfies: TG-004.
  Files: `apps/api/test/telegram.e2e-spec.ts`.
  Notes: assert the bot token does not appear in the captured logs.

- [ ] **T-D4 — Bot token absence from the client bundle.**
  Satisfies: TG-004.
  Files: `apps/web/e2e/security.spec.ts` (Playwright).
  Notes: assert the built client bundle contains no `TELEGRAM_BOT_TOKEN` value.
