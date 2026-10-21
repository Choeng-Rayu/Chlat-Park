# Telegram Bot

**Status:** Planned (P1)
**Requirement IDs:** TG-001 … TG-012
**Depends on:** `entry-qr-claim`, `guest-ticket`, `authorization`

---

## 1. Problem

Owners who prefer Telegram should be able to claim their entry QR and receive their e-ticket
without installing anything. Telegram is a **delivery channel**, not a second ticket system: the bot
must call the **same backend domain services** as the website. If the bot had its own rules, the
two channels would drift, and the drift would show up as tickets the website would not have
issued.

Telegram also has hard constraints that shape the design:

* It requires an internet connection. During a total outage the bot cannot answer at all, and the
  product must not pretend otherwise.
* Telegram **retries** webhook deliveries. Every update may arrive more than once, so every
  handler must be idempotent.
* The bot token is a **secret** and must never reach the browser or the client code.

## 2. Scope

### 2.1 In scope

* A Telegram bot implemented as a **module inside the NestJS API** (ADR-001).
* The webhook endpoint, with secret-token validation and update-id deduplication.
* A deep link from the entry QR (`https://t.me/<bot>?start=<claimToken>`).
* The claim flow through the bot, calling the same `EntryClaimsService`.
* Sending the ticket details and a QR image to the owner.
* Optional Telegram identity linking to a registered account.
* The `start`/`help` commands and the Khmer and English message set.

### 2.2 Out of scope

* A separate Telegram bot service or worker (ADR-001 settles this: it is a module).
* Telegram Login Widget as an authentication method.
* Telegram payments and Telegram Stars.
* Push notifications for the owner beyond the ticket message.
* Offline Telegram operation (impossible — Telegram requires the internet).

## 3. Actors

| Actor | Interaction |
|---|---|
| Guest motorcycle owner | Starts the bot, claims a session, receives a ticket |
| Registered motorcycle owner | The same, plus linking their Telegram identity to their account |
| Security guard | Unaffected — the bot never creates or closes a session directly |

## 4. Behaviour

### 4.1 The deep link

The entry QR may point at the website (the default) or at a Telegram deep link. The deep link
carries the **claim token** as the `start` parameter:

```
https://t.me/chlatpark_bot?start=<claimToken>
```

The bot receives the token from Telegram, then calls the same
`EntryClaimsService.claim(token)` the website uses.

### 4.2 The claim

1. The owner presses **Start**.
2. The bot calls the API's claim service with the token.
3. On success, the bot sends the ticket: the site, the plate, the entry time, the reference, and a
   QR image of the ticket token.
4. The bot stores the ticket reference in the chat's state so `/ticket` can show it again.

### 4.3 Identity linking

A registered owner can link their Telegram account. The flow is: the owner sends `/link`, the bot
sends them a one-time code, they enter it on the website while signed in, and the website confirms
the link. **The bot never asks for a password.**

### 4.4 Failure handling

Every failure the bot can hit has a defined message, in the language the owner selected. The bot
must never leak internal error details, tokens, or session ids.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| TG-001 | The Telegram integration must be implemented as a module inside the NestJS API and must call the same domain services as the website, so that no ticket rule is implemented twice. | P0 |
| TG-002 | The webhook endpoint must validate the Telegram secret token on every delivery and must reject an invalid one with 401 before processing the update. | P0 |
| TG-003 | The webhook must be idempotent: a repeated `update_id` must produce no additional ticket, no additional audit row, and no duplicate message. | P0 |
| TG-004 | The bot token must be stored only in the deployment secret store and must never be returned by an API, embedded in the client, or written to a log. | P0 |
| TG-005 | The claim flow through the bot must use the same claim validation, expiry, revocation, and rate limits as the website, and must present the same failure messages. | P0 |
| TG-006 | The ticket message sent through Telegram must contain the same minimum information as the web ticket — site, plate, entry time, reference — and must not contain internal identifiers, the guard id, or the pricing policy id. | P0 |
| TG-007 | The bot must be able to send the ticket as a QR image where Telegram supports it, and the image must encode only the ticket token. | P0 |
| TG-008 | Linking a Telegram identity to an account must require proof from the website side; the bot must never request or accept a password, and an unlinked Telegram identity must have no access to any ticket. | P0 |
| TG-009 | The bot must handle a backend outage with a clear, non-technical message and must not retry internally in a way that duplicates a claim. | P0 |
| TG-010 | The bot must support Khmer and English, selected by the user's Telegram language, with the site's language as the fallback. | P0 |
| TG-011 | The webhook must not process an update whose payload exceeds the configured size limit, and must reject a malformed update with 400. | P0 |
| TG-012 | Every bot action that issues a ticket or changes state must be written to the audit log with the channel recorded as "telegram". | P0 |

## 6. Acceptance criteria

### Normal

* **TG-001, TG-005** — Given a valid entry claim token, when the owner starts the bot with that
  token, then exactly one ticket is issued and the session becomes `ACTIVE` — identical to the
  website flow.
* **TG-002** — Given a webhook delivery with an invalid secret token, when it is received, then the
  response is 401 and no update is processed.
* **TG-003** — Given a webhook delivery for `update_id` 1001, when the same delivery is received
  again, then only one ticket exists and one message was sent.
* **TG-006, TG-007** — Given a successful claim, when the bot sends the ticket, then the message
  contains the site name, the plate, the entry time, and the reference, and a QR image is attached
  whose payload is only the ticket token.

### Failure

* **TG-005** — Given an expired claim token, when the owner starts the bot, then the bot replies
  with the "expired" message and no ticket is issued.
* **TG-005** — Given a claim token that was already claimed on the website, when the owner starts
  the bot, then the bot replies with the "already claimed" message and no second ticket exists.
* **TG-009** — Given the API is unavailable, when the owner sends a command, then the bot replies
  with a temporary-failure message and no error detail is shown.
* **TG-011** — Given a webhook delivery with a malformed update body, when it is received, then the
  response is 400.

### Abuse

* **TG-002** — Given 100 webhook deliveries with random secret tokens, when they are received,
  then every one is rejected with 401 and no ticket is issued.
* **TG-003** — Given a duplicate delivery of `update_id` 1001 ten times, when they are received,
  then exactly one ticket exists and exactly one message was sent.
* **TG-008** — Given a Telegram identity that is not linked, when the user asks for a ticket in
  the chat, then the bot does not disclose any ticket and does not ask for a password.
* **TG-004** — Given the bot is running, when the application logs are inspected, then no log line
  contains the bot token.
* **TG-012** — Given a ticket issued through Telegram, when the audit log is queried, then the row
  records the channel as "telegram".

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Webhook or long polling for the pilot? | Engineering | Phase 5 (deferred in ADR-013; the webhook is the default because Coolify provides a stable public URL) |
| Q2 | Should the entry QR point at the website, at Telegram, or offer a choice? | Product owner | Phase 5 |
| Q3 | Should the bot support a `/my` command listing the user's linked tickets? | Product owner | Phase 6 |
| Q4 | What is the retention of the Telegram chat state? | Engineering | Phase 5 |

## 8. Related

* `specs/features/entry-qr-claim/` — the claim the bot calls.
* `specs/features/guest-ticket/` — the ticket the bot delivers.
* `specs/features/internationalization/` — the message set.
* ADR-013 — Telegram delivery mode.
