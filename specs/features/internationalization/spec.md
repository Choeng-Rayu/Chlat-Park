# Internationalization

**Status:** In progress
**Requirement IDs:** I18N-001 … I18N-010
**Depends on:** —

---

## 1. Problem

The guards are Cambodian. The motorcycle owners are Cambodian. The parking owners are Cambodian. The
platform administrator may not be. The user interface must therefore work in **Khmer and
English**, and it must work for a guard on a low-end Android phone in a car park in bright daylight
with one hand.

The technical requirement is simple; the discipline requirement is not. The failure mode of
i18n is a codebase where half the strings are translated and half are hard-coded, so the language
toggle silently does nothing on some screens. This spec therefore makes **key parity** a test, not
a convention.

**Khmer is not a "nice to have" here.** It is the primary language of the guard, who performs the
most safety-critical operation in the product (authorizing a motorcycle to leave).

## 2. Scope

### 2.1 In scope

* Two locales: `en` (English) and `km` (Khmer).
* A message catalogue per locale, in JSON, with a nested key structure.
* A key naming convention: `<domain>.<section>.<element>`.
* The web app (owner, guest, and guard surfaces).
* The API's user-facing error messages (the `message` field of the error envelope).
* The Telegram bot's message set (P1).
* Date, number, and currency formatting per locale and per site timezone.
* The language switcher, and the default language per site.
* A key-parity CI check.

### 2.2 Out of scope

* A third language (Chinese, Vietnamese) — the catalogue is designed to accept one, but only two
  ship.
* Right-to-left support.
* A translation management system (a spreadsheet or a service). The JSON files are the source of
  truth, and a translator edits them directly.
* User-selectable dates or numbering conventions.
* Translating the content of a QR code or a ticket reference (these are data, not UI).

## 3. Actors

| Actor | Interaction |
|---|---|
| Security guard | Uses the guard dashboard, primarily in Khmer |
| Guest motorcycle owner | Uses the ticket page, in whichever language their device or the site prefers |
| Parking owner | Uses the owner console, in either language |
| Platform administrator | Uses the admin console, in either language |

## 4. Behaviour

### 4.1 Language selection

The language is resolved in this order:

1. The **explicit user preference** (the switcher), persisted in a cookie.
2. The **Telegram user's language** (for the bot channel).
3. The **site's default language** (`parking_sites.settingsJson.defaultLanguage`).
4. The browser's `Accept-Language` header.
5. The fallback: `en`.

For the guard dashboard, the site default wins over the browser header — a guard at a Khmer site
sees Khmer regardless of their phone's settings.

### 4.2 Formatting

* **Dates and times** are rendered in the **site's timezone**, formatted per locale. The storage is
  always UTC.
* **Numbers** use the locale's separators.
* **Currency** is formatted per the site's currency, from the minor-unit amount. A "flat" price of
  1.50 USD renders as `$1.50` in English and as the site's convention in Khmer.
* **Plates** are rendered verbatim — they are identifiers, not text to be localised. A plate is
  never translated, transliterated, or case-folded in the display.

## 5. The key naming convention

```
<domain>.<section>.<element>

guard.entry.title
guard.entry.plate_label
guard.entry.confirm_button
guard.exit.verdict.plate_mismatch
owner.sites.list.empty
ticket.display.instructions
common.error.network
telegram.ticket_issued
```

| Rule | Detail |
|---|---|
| The domain | The feature surface: `guard`, `owner`, `ticket`, `admin`, `common`, `telegram` |
| The section | The screen or the component group: `entry`, `exit`, `list`, `display` |
| The element | The specific string: `title`, `plate_label`, `empty`, `error` |
| Lowercase | Every segment is `lower_snake_case` |
| Dots only | No dashes, no slashes, no camelCase |
| No interpolation in the key | The value carries the placeholders, never the key |
| The `common.` namespace | Shared strings: buttons, errors, units, dates |

**Placeholders** use `{{name}}`:

```json
{
  "ticket": {
    "display": {
      "issued": { "en": "Your ticket for {{plate}} at {{site}}.", "km": "សាកល្បងរបស់អ្នកសម្រាប់ {{plate}} នៅ {{site}}។" },
      "entry_time": { "en": "Entered at {{time}}", "km": "បានចូលម៉ោង {{time}}" }
    }
  }
}
```

## 6. The message files

```
packages/i18n/
├── messages/
│   ├── en.json
│   └── km.json
├── index.ts          # the loader, the `t()` helper, the interpolation
└── scripts/
    └── check-parity.ts   # the CI key-parity check
```

The files are nested to the third level:

```jsonc
// packages/i18n/messages/en.json
{
  "common": {
    "button": { "confirm": "Confirm", "cancel": "Cancel", "retry": "Try again" },
    "error":  { "network": "No connection. Check your network and try again.", "unknown": "Something went wrong." },
    "unit":   { "minutes": "min", "hours": "h" }
  },
  "guard": {
    "entry": {
      "title": "Vehicle entry",
      "plate_label": "Plate number",
      "confirm_button": "Confirm entry",
      "reissue_button": "Show a new code",
      "qr_expiry": "This code expires in {{seconds}} seconds"
    },
    "exit": {
      "title": "Vehicle exit",
      "authorize_button": "Authorize exit",
      "plate_check": "I have checked the plate on the motorcycle",
      "verdict": {
        "VALID": "Ready to exit",
        "PAYMENT_PENDING": "Payment required",
        "PLATE_MISMATCH": "Plate does not match",
        "ALREADY_COMPLETED": "Already exited",
        "REVOKED": "Ticket was revoked",
        "EXPIRED": "Ticket expired",
        "UNKNOWN": "Ticket not found",
        "MANUAL_REVIEW_REQUIRED": "Needs a supervisor",
        "NOT_ACTIVE": "No active parking session"
      }
    }
  },
  "ticket": { "display": { … } },
  "owner":  { "sites": { … }, "reports": { … } },
  "admin":  { "revenue": { … }, "adoption": { … } },
  "telegram": { … }
}
```

## 7. Requirements

| ID | Requirement | Priority |
|---|---|---|
| I18N-001 | The system must support the `en` and `km` locales, and every user-facing string in the web app, the API's error messages, and the Telegram bot must be resolved through a message key. | P0 |
| I18N-002 | The message catalogue must be stored per locale in a JSON file under `packages/i18n/messages/{locale}.json`, and must use the nested key convention `<domain>.<section>.<element>`. | P0 |
| I18N-003 | A CI check must fail when the key sets of the locales differ, and must report the missing keys on both sides. | P0 |
| I18N-004 | A missing key must fall back to English, and if English is also missing, to a visible placeholder key rather than to an empty string or an exception. | P0 |
| I18N-005 | The user-facing `message` of every API error must be resolved in the caller's locale, and the `code` must remain a stable, locale-independent identifier. | P0 |
| I18N-006 | The language must be resolved in this order: the explicit user preference, the channel's language (Telegram), the site's default language, the browser's `Accept-Language`, then `en`. | P0 |
| I18N-007 | Dates and times must be displayed in the site's timezone, formatted per the locale, and stored in UTC. | P0 |
| I18N-008 | Amounts must be formatted from integer minor units using the site's currency, with no floating-point conversion. | P0 |
| I18N-009 | Identifiers — the plate, the ticket reference, the site code, the ticket token — must be rendered verbatim and must never be translated, transliterated, or case-folded in the display. | P0 |
| I18N-010 | The verification verdict, the session status, the payment status, and the ticket status must have a translated label for every allowed value, and the label must be accompanied by an icon or a text marker so that the meaning does not depend on colour alone. | P0 |

## 8. Acceptance criteria

### Normal

* **I18N-001, I18N-002** — Given the locale is "km", when the guard dashboard loads, then the
  entry screen's title and button labels are the Khmer strings from `messages/km.json`.
* **I18N-005** — Given a request with the `Accept-Language: km` header that fails validation, then
  the error `message` is in Khmer and the error `code` is the same as it would be in English.
* **I18N-010** — Given the exit verdict is `PLATE_MISMATCH`, when it is displayed in either locale,
  then a translated label is shown together with a non-colour marker.

### Failure

* **I18N-004** — Given a key that exists in `en.json` but not in `km.json`, when it is requested
  with the locale "km", then the English string is returned and no exception is thrown.
* **I18N-004** — Given a key that exists in neither file, when it is requested, then a visible
  placeholder containing the key name is returned.
* **I18N-003** — Given `km.json` is missing a key that `en.json` has, when the parity check runs,
  then the check fails and reports the missing key.

### Abuse

* **I18N-006** — Given a site whose default language is "km" and a browser requesting "en", when
  the guard dashboard loads, then the interface is in Khmer.
* **I18N-009** — Given a plate "AB-123", when it is displayed in the Khmer locale, then it appears
  exactly as "AB-123" and is not transliterated.
* **I18N-005** — Given a client sends a malformed `Accept-Language` header, then the request is
  processed normally and the fallback locale is used.
* **I18N-008** — Given an amount of 150 minor units in "USD", when it is displayed in the Khmer
  locale, then the rendered amount is 1.50 and not 150.
* **I18N-003** — Given a key was added to `en.json` and the pull request includes only the English
  file, then the CI parity check fails.

## 9. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Who maintains the Khmer translations, and what is the review process? | Product owner | Phase 2 |
| Q2 | Should the guard dashboard default to Khmer regardless of the browser, even for a site whose default is English? | Product owner | Phase 4 |
| Q3 | What is the Khmer formatting convention for currency in each supported currency? | Product owner | Phase 4 |

## 10. Related

* `specs/features/telegram-bot/` — the `telegram.*` message namespace.
* `specs/features/exit-verification/` — the verdict labels.
* `specs/features/guest-ticket/` — the ticket display.
* `packages/i18n/messages/{en,km}.json` — the catalogues.
