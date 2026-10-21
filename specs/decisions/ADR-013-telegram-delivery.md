# ADR-013: Telegram Delivery Mode

**Status:** Accepted (with deferred sub-decisions)
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** TG-001 … TG-012

---

## Context

The plan's §4.3 specifies a Telegram flow: the owner scans the entry QR, Telegram opens the bot, the
bot claims the session, and the bot sends the ticket. The plan also says clearly that **Telegram
requires internet** and that during a complete outage the bot cannot issue a new response.

Telegram is a **delivery channel**, not a second ticket system. The plan's §15 warns:
*"Use the same backend business logic as the website. Telegram identity is an optional
identity/linking mechanism, not a separate ticket database."*

Three questions have to be settled:

1. **Webhook or long polling?** Telegram can push updates to a webhook URL, or the bot can poll
   for them.
2. **Is the bot a separate service or a module?** ADR-001 already settles this: a module inside
   the NestJS API.
3. **How does the owner get from the QR to the bot?** A deep link carrying the claim token, or a
   web page that offers both.

The pilot's deployment is a VPS behind Coolify, which provides a stable public HTTPS URL — a
natural fit for a webhook. Long polling, on the other hand, needs a long-running process that
makes an outbound connection and holds it open, which competes with the API for resources and
makes the deployment harder to reason about.

There is a further consideration specific to this product: **Telegram is the most likely channel
for a Khmer-speaking owner who has no desire to install a PWA.** It is a first-class user
experience, not an afterthought. But it is P1 — the web/PWA flow is the primary channel, and the
MVP must not depend on the bot.

## Decision

1. **The Telegram integration is a module inside the NestJS API** (`TelegramModule`), not a
   separate service (ADR-001). It calls the **same domain services** as the web app — the claim
   service, the ticket service, the user service. It contains **no business logic**.

2. **The transport is a webhook**, received at `POST /api/v1/telegram/webhook`, with the Telegram
   **secret token** validated on every delivery. The secret token is a separate environment
   variable from the bot token, so it can be rotated without rotating the bot token.

3. **The webhook is idempotent.** Telegram retries a non-2xx delivery, so every update may arrive
   more than once. The `update_id` is stored as a **primary key**, and a duplicate insert is
   treated as "already handled" — a successful, no-op `200`.

4. **The bot token is a deployment secret.** It lives only in the environment. It is never
   returned by an API, never in the client bundle, and never written to a log.

5. **The claim flow through the bot is identical to the website's.** The same token, the same
   validation, the same expiry, the same revocation, the same single-use rule, and the same rate
   limits. The bot is a *renderer* of the domain's outcomes, not a second implementation.

6. **The deep link carries the claim token**: `https://t.me/<bot>?start=<claimToken>`. The token
   is a single-use, 5-minute credential (ADR-008), so the exposure from Telegram's servers
   holding it is bounded.

7. **The bot sends the ticket details and a QR image** of the ticket token where Telegram
   supports it. The image encodes only the ticket token.

8. **The bot's messages come from the shared i18n catalogue**, in the `telegram.*` namespace, so
   the key-parity CI check covers them like every other string.

9. **A Telegram identity may exist before the user has an account.** `telegram_identities.user_id`
   is nullable. Linking is **website-initiated**: the website generates a one-time code, the owner
   sends it in the chat, and the bot confirms it. **The bot never asks for a password.**

10. **An unlinked Telegram identity has no access to any ticket.** It can claim a session with a
    token — exactly like a website guest — and it can hold the ticket it claimed in that chat.

11. **A failed outbound message does not roll back the ticket.** The ticket is the source of truth;
    the message is a delivery. The failure is logged and is visible in the delivery metrics.

12. **The bot is P1.** The MVP must not depend on it, and the web/PWA flow is the primary channel.

## Consequences

### Positive

* **The bot and the website cannot disagree.** The bot calls the same service; the claim rate, the
  failure codes, and the rate limits are identical by construction.
* **The webhook needs no long-running poller.** The API already serves HTTP; the bot adds a route
  and a module.
* **A duplicate delivery is harmless.** The `update_id` primary key makes the dedupe a database
  guarantee, not a cache that can be lost.
* **The bot is a first-class channel for the target audience.** Khmer speakers who will not install
  a PWA can still park.
* **The bot token and the webhook secret are separately rotatable.**
* **A Telegram outage does not affect the web flow.** The module is isolated; the outbound calls
  are time-boxed.

### Negative

* **The webhook exposes a public endpoint.** It is on the reviewed `@Public()` allowlist, and it is
  protected by the secret token, the body size limit, and the update-id dedupe.
* **Telegram's servers hold the claim token** in the deep link. The token is single-use and
  expires in 5 minutes, so the exposure is bounded, but it is not zero.
* **Telegram cannot issue a ticket during a total outage.** The product states this plainly; the
  web/PWA flow has the same limitation, and neither is a difference from the MVP's online-first
  posture.
* **A duplicate delivery still costs one HTTP request and one database insert.** Negligible.
* **The bot is P1, so the MVP's "two access channels" goal is only partly met** in the first
  release.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | **Webhook or long polling?** | The current answer: the webhook, because Coolify provides a stable public HTTPS URL and a webhook needs no long-running poller. This is confirmed at the start of Phase 5 — if the deployment cannot expose a stable URL, long polling is the fallback. | Phase 5 |
| D2 | **Should the entry QR point at the website, at Telegram, or offer a choice?** | The current answer: the website, with a Telegram option available from the claim page. A QR that assumes the owner uses Telegram would fail for the owners who do not. | Phase 5 |
| D3 | **Should the bot support a `/my` command listing the linked tickets?** | It needs the linking to be reliable first. | Phase 6 |
| D4 | **What is the retention of the Telegram chat state?** | The chat state holds the last ticket reference per chat. A short TTL (30 days) is the current answer. | Phase 5 |
| D5 | **Should the bot support the owner's language automatically?** | Yes — the Telegram user's `language_code` resolves the locale, with the site's default as the fallback. Settled. | Phase 5 |
| D6 | **Should the bot be able to issue a ticket for a session claimed on the website?** | The current answer: no, and it is not needed — the ticket is in the owner's Telegram chat from the claim. | Phase 6 |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| A separate Telegram bot service | It would need the database and the domain services, and it would add a second deployment for a P1 feature. The rules would begin to drift. ADR-001 settles this. |
| Long polling | It needs a long-running process that holds an outbound connection, competing with the API for resources, and it makes the deployment harder to reason about. The fallback if the deployment cannot expose a stable URL. |
| The bot implementing its own claim rules | Two implementations of one rule always drift. The claim rate, the failure codes, and the rate limits would diverge. |
| A shared "channel" abstraction with per-channel implementations | Premature. The Telegram module calls the domain services directly; a channel abstraction is only worth building when a third channel appears. |
| The bot sending the ticket token as text | The QR image already carries it; sending it as text makes it trivially copyable out of the chat. |
| Linking a Telegram identity by the user typing their email and password | Never accept a password in a chat. The code-based, website-initiated flow is the design. |
| Requiring the user to register before the bot can claim | Breaks the core promise: a guest must be able to park. |
| The bot retrying a failed claim internally | The update dedupe plus Telegram's own retry cover it; an internal retry risks a double claim. |
| The bot silently failing when the backend is down | A silent failure is worse than a bad experience: the owner does not know whether to wait or to ask the guard. The bot replies with a clear, non-technical message. |
| The entry QR pointing only at Telegram | It would fail for every owner who does not use Telegram — which, per the product's own design, is a large group. |

## Related

* `specs/features/telegram-bot/` — the requirements and the design.
* `specs/features/internationalization/` — the `telegram.*` message namespace.
* `specs/features/entry-qr-claim/` — the claim the bot calls.
* ADR-001 — the module decision.
* ADR-008 — the claim token that the deep link carries.
