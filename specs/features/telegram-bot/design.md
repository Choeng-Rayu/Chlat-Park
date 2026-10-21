# Telegram Bot — Design

**Status:** Planned (P1)
**Requirement IDs:** TG-001 … TG-012
**Delivery mode:** Deferred between webhook and long polling — see ADR-013.

---

## 1. Architecture

```
Telegram servers
      │  HTTPS POST /api/v1/telegram/webhook
      │  header: X-Telegram-Bot-Api-Secret-Token
      ▼
apps/api
┌────────────────────────────────────────────────────────────────┐
│ TelegramModule                                                │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │ TelegramWebhookCtrl  │───▶│ TelegramUpdateHandler        │  │
│  │  @Public()            │    │  1. dedupe by update_id      │  │
│  │  validate secret      │    │  2. route by command         │  │
│  │  size / shape check   │    │  3. call the DOMAIN service  │  │
│  └──────────────────────┘    └──────────────┬───────────────┘  │
│                                            │                 │
│                   ┌────────────────────────┴────────┐        │
│                   ▼                                 ▼        │
│        EntryClaimsService.claim()          TicketsService   │
│        (the SAME service the web app uses)                  │
│                   │                                 │        │
│                   └────────────┬────────────────────┘        │
│                                ▼                             │
│                     TelegramClient (outbound)               │
│                     POST api.telegram.org/bot<token>/...    │
└────────────────────────────────────────────────────────────────┘
```

**The bot has no business logic.** It translates Telegram messages into calls on the same domain
services the website uses, and translates the results into messages.

## 2. Data model

```prisma
model TelegramIdentity {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String?  @db.Uuid      // null until linked
  telegramUserId String   @unique
  chatId         String?
  languageCode   String   @default("en")
  linkedAt       DateTime? @db.Timestamptz(3)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)

  user           User?    @relation(fields: [userId], references: [id])

  @@index([userId])
}

model TelegramUpdate {
  updateId   BigInt   @id          // the dedupe key (TG-003)
  receivedAt DateTime @default(now()) @db.Timestamptz(3)
  kind       String
  handledAt  DateTime? @db.Timestamptz(3)

  @@index([receivedAt])
}
```

`TelegramUpdate.updateId` is the primary key, so a duplicate delivery fails the insert and the
handler short-circuits — the dedupe is enforced by the database, not by a cache.

## 3. The webhook

### 3.1 Validation order

```
1. Content-Length / body size limit        → 413 if exceeded
2. X-Telegram-Bot-Api-Secret-Token header   → 401 if it does not match
3. JSON body shape (update_id present)      → 400 if malformed
4. Insert into telegram_updates             → on a unique violation, return 200 (already handled)
5. Route the update                         → 200
```

**A duplicate delivery returns 200**, not 409. Telegram retries a non-2xx response, and a duplicate
is not an error — it is the expected case.

### 3.2 The secret token

Telegram supports a `secret_token` on the webhook, sent on every delivery in
`X-Telegram-Bot-Api-Secret-Token`. It is configured once when the webhook is registered:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d url="https://api.<domain>/api/v1/telegram/webhook" \
  -d secret_token="${TELEGRAM_WEBHOOK_SECRET}" \
  -d allowed_updates='["message"]'
```

The secret is a separate environment variable from the bot token, so the webhook secret can be
rotated without rotating the bot token.

## 4. Commands

| Command / payload | Behaviour | Domain call |
|---|---|---|
| `/start <token>` | Claim the session and send the ticket | `EntryClaimsService.claim(token)` |
| `/start` (no token) | A greeting with instructions | — |
| `/ticket` | Re-send the last ticket in this chat | `TicketsService.getDisplay(reference)` |
| `/link` | Start the linking flow (sends a one-time code) | `UsersService.beginTelegramLink()` |
| `/help` | The message set in the user's language | — |
| `/language en` / `/language km` | Set the chat language | — |
| any other text | A help hint | — |

### 4.1 The linking flow

```
Owner (website, signed in)                Telegram
─────────────────────────                  ─────────
POST /account/telegram/link
  → generates a 6-digit code (10 min TTL)
  → shows the code on the website
                                         owner sends /link
                                           → the bot asks for the code
                                         owner sends the code
                                           → the bot calls
                                             POST /telegram/confirm-link { code }
                                           → the API links telegramUserId → userId
```

The **website** initiates; the Telegram side confirms. The bot never sees a password, and it can
never link an identity to an account on its own.

The one-time code is stored hashed, with an expiry and a single use.

## 5. Message templates

Messages are resolved through the same i18n mechanism as the web app
(`specs/features/internationalization/`), with the Telegram-specific namespace `tg.*`.

```jsonc
{
  "tg": {
    "start":            { "en": "Welcome to Chlat Park.", "km": "សូមស្វាគមន៍ មក Chlat Park។" },
    "ticket_issued":    { "en": "Your ticket for {plate} at {site}.", "km": "…" },
    "claim_expired":    { "en": "This code has expired. Please ask the guard for a new one.", "km": "…" },
    "claim_revoked":    { "en": "This code is no longer valid.", "km": "…" },
    "claim_used":       { "en": "This ticket has already been claimed.", "km": "…" },
    "claim_unknown":    { "en": "We could not find that ticket.", "km": "…" },
    "service_unavailable": { "en": "Chlat Park is temporarily unavailable. Please try again shortly.", "km": "…" },
    "link_prompt":      { "en": "Send the code shown on the Chlat Park website.", "km": "…" },
    "link_success":     { "en": "Your Telegram account is now linked.", "km": "…" },
    "link_failed":      { "en": "That code is not valid or has expired.", "km": "…" }
  }
}
```

**Failure messages are deliberately indistinguishable where the distinction would help an
attacker.** `claim_unknown` covers both "no such token" and "not yours".

## 6. State transitions

### 6.1 The Telegram identity

```
   (none) ──the user messages the bot──▶ UNLINKED
                                              │
                                              ├──the code is confirmed on the website──▶ LINKED
                                              │      (userId set, linkedAt set)
                                              │
                                              └──the code is wrong or expired──────────▶ UNLINKED (unchanged)
```

An `UNLINKED` identity has **no access to any ticket** (TG-008). It can claim a session with a
token, exactly like a website guest, and it can hold the ticket it just claimed in that chat.

### 6.2 The update lifecycle

```
  received ──insert──▶ stored (handledAt = null)
     │                      │
     └──duplicate──▶ (rejected by the primary key; returns 200)
                            │
                            ▼
                        handled (handledAt = now)
```

## 7. Failure handling

| Failure | Response to Telegram | Handling |
|---|---|---|
| Invalid secret token | 401 | Nothing is processed |
| Malformed body | 400 | Nothing is processed |
| Body too large | 413 | Nothing is processed |
| Duplicate `update_id` | **200** | The insert conflicts; the handler returns immediately |
| The claim token is unknown | 200 | The bot replies with `claim_unknown` |
| The claim token is expired | 200 | The bot replies with `claim_expired` |
| The claim token is revoked | 200 | The bot replies with `claim_revoked` |
| The claim token is already used | 200 | The bot replies with `claim_used` |
| The backend is unavailable | 200 | The bot replies with `service_unavailable`; the domain call is **not** retried inside the handler (Telegram's own retry plus the update dedupe handle it) |
| Sending the message fails (Telegram is down) | 200 | The error is logged with the request id; the ticket is still issued, and the owner can retrieve it from the website |
| The rate limit is exceeded | 200 | The bot replies with a "wait a moment" message |

**A failed outbound message does not roll back the ticket.** The ticket is the source of truth; the
message is a delivery. The failure is logged and is visible in the admin console's delivery
metrics.

## 8. Security considerations

| Threat | Control |
|---|---|
| Somebody posting to the webhook to trigger claims | The secret token is required; the claim still needs a valid single-use token |
| The bot token leaking | It lives only in the environment; the logger redacts it; no endpoint returns it; the client bundle never contains it |
| A webhook replay | The `update_id` primary key makes a replay a no-op |
| An unlinked Telegram user reading someone else's ticket | An unlinked identity has no ticket access; the chat state holds only the tickets claimed **in that chat** |
| The bot asking for a password | The bot has no password command; the linking flow is code-based and website-initiated |
| The bot leaking internal errors | Every error is mapped to a fixed message key; the raw error is logged server-side, never sent |
| The claim token in a Telegram message | The token is in the deep link, which Telegram stores in its own servers. This is a deliberate trade-off: the token is single-use and short-lived (ADR-008) |
| A rate-limit bypass by alternating IPs | The domain service applies the same per-IP and per-session limits; the bot does not bypass them |

## 9. Observability

| Event | Where |
|---|---|
| `telegram.webhook_received` | Metrics (by update kind) |
| `telegram.webhook_rejected` | Metrics (by reason: secret, shape, size) |
| `telegram.update_duplicate` | Metrics |
| `telegram.message_sent` / `telegram.message_failed` | Metrics |
| `ticket.issued` with `channel = telegram` | Audit log (TG-012) |
| `telegram.identity_linked` | Audit log |
| `telegram_claim_total{outcome}` | Metrics — the bot's claim success rate |

## 10. Alternatives considered

| Alternative | Why rejected |
|---|---|
| A separate Telegram bot service | ADR-001 settles it: a module inside the API, so the business rules cannot drift. |
| Long polling | Simpler to set up, but it needs a long-running process and it competes with the API for resources. The webhook is the default; the mode is deferred in ADR-013. |
| The bot implementing its own claim rules | Two implementations of one rule always drift. |
| Sending the ticket token in a message | The QR image already carries it; sending it as text would make it copyable out of the chat. |
| Linking a Telegram identity by the user typing their email and password | Never accept a password in a chat. |
| Retrying a failed claim inside the handler | The update dedupe plus Telegram's retry covers it; an internal retry risks a double claim. |
| Storing the Telegram identity with a required `user_id` | A user may message the bot before they ever register. The link is created unlinked. |
