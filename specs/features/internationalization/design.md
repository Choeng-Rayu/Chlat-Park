# Internationalization — Design

**Status:** In progress
**Requirement IDs:** I18N-001 … I18N-010

---

## 1. Architecture

```
                    packages/i18n
                    ├── messages/en.json
                    ├── messages/km.json
                    ├── index.ts        load(locale), t(key, params, locale)
                    └── scripts/check-parity.ts
                           │
        ┌──────────────────┼───────────────────────┐
        ▼                  ▼                       ▼
   apps/web          apps/api               TelegramModule
   (useTranslations) (Accept-Language        (tg.* namespace)
                       → the error message)
```

**One catalogue, three consumers.** The web app, the API's error messages, and the bot all read
the same JSON files. A string added to the web UI and not to the bot is caught by the parity check
only if the key sets diverge — which is exactly what the check prevents.

## 2. The loader

```ts
// packages/i18n/index.ts
import en from './messages/en.json';
import km from './messages/km.json';

export const LOCALES = ['en', 'km'] as const;
export type Locale = (typeof LOCALES)[number];

const CATALOGUES: Record<Locale, unknown> = { en, km };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(input: string | undefined | null): Locale {
  if (!input) return 'en';
  const primary = input.split(',')[0]?.split('-')[0]?.trim().toLowerCase();
  return isLocale(primary ?? '') ? primary : 'en';
}

export function t(
  key: string,
  params: Record<string, string | number> = {},
  locale: Locale = 'en',
): string {
  const value = lookup(CATALOGUES[locale], key) ?? lookup(CATALOGUES.en, key);

  if (typeof value !== 'string') {
    // Never return an empty string — a visible placeholder is debuggable (I18N-004)
    return `⟨${key}⟩`;
  }

  return value.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
```

`lookup` walks the nested object by splitting the key on `.`.

## 3. The key-parity check

```ts
// packages/i18n/scripts/check-parity.ts
import en from '../messages/en.json';
import km from '../messages/km.json';

function flatten(obj: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, path).forEach((x) => keys.add(x));
    else keys.add(path);
  }
  return keys;
}

const enKeys = flatten(en);
const kmKeys = flatten(km);

const missingInKm = [...enKeys].filter((k) => !kmKeys.has(k));
const missingInEn = [...kmKeys].filter((k) => !enKeys.has(k));

if (missingInKm.length || missingInEn.length) {
  console.error('i18n key parity check failed');
  if (missingInKm.length) console.error('  missing in km.json:', missingInKm.join(', '));
  if (missingInEn.length) console.error('  missing in en.json:', missingInEn.join(', '));
  process.exit(1);
}
console.log(`i18n key parity OK — ${enKeys.size} keys`);
```

**This runs in CI on every pull request** (I18N-003). A pull request that adds an English string
without the Khmer one fails the build. That is the whole point: key parity is enforced, not
remembered.

An optional stricter check (not enforced in the MVP) flags a key whose English and Khmer values are
byte-identical — often a sign of an untranslated string.

## 4. The web app

### 4.1 Server components

```tsx
// apps/web/src/app/(guard)/site/[siteId]/entry/page.tsx
import { getTranslations } from '@/lib/i18n/server';

export default async function EntryPage({ params }: { params: { siteId: string } }) {
  const t = await getTranslations('guard.entry');
  return <h1>{t('title')}</h1>;
}
```

`getTranslations` resolves the locale from the request (the preference cookie → the site's default →
`Accept-Language`) and returns a bound `t` for the given namespace.

### 4.2 Client components

```tsx
'use client';
import { useTranslations } from '@/lib/i18n/client';

export function PlateInput() {
  const t = useTranslations('guard.entry');
  return <input placeholder={t('plate_label')} />;
}
```

The client bundle receives the resolved message object for the namespace it needs. The full
catalogue is **not** shipped to the browser for every page — a bundle-size concern that also keeps
the API's internal wording out of the client.

### 4.3 The language switcher

A small control in the header. It sets a `lang` cookie (`en` or `km`) and refreshes the route. The
cookie is `SameSite=Lax`, not `HttpOnly` (the client reads it), and holds no secret.

## 5. The API's error messages

The API resolves the `message` field of the error envelope from the caller's locale:

```ts
// apps/api/src/common/filters/all-exceptions.filter.ts
const locale = resolveLocale(req.headers['accept-language']);
res.status(safe.status).json({
  error: {
    code: safe.code,                                  // stable, locale-independent
    message: t(`common.error.${safe.code}`, {}, locale),
    details: safe.details,
    requestId: req.requestId,
  },
});
```

**The `code` is the contract.** The web app switches on `code` to choose the action; the `message`
is for a human and may be translated.

A code with no message key returns a generic message in the caller's locale plus the code in
brackets, so a missing translation is visible in production without breaking the response.

## 6. Formatting

### 6.1 Dates and times

```ts
export function formatDateTime(iso: string, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === 'km' ? 'km-KH' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}
```

The **site's timezone** comes from `parking_sites.timezone`; the storage is UTC
(I18N-007). A guard at a site sees the site's local time, not the phone's.

### 6.2 Amounts

```ts
export function formatMoney(minor: number, currency: string, locale: Locale): string {
  const digits = MINOR_UNIT_DIGITS[currency] ?? 2;     // USD → 2, KHR → 0
  const major = minor / 10 ** digits;
  return new Intl.NumberFormat(locale === 'km' ? 'km-KH' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);
}
```

The conversion happens once, at the display boundary, from an integer (I18N-008). There is no
floating-point money anywhere in the pipeline.

### 6.3 Identifiers

Plates, ticket references, and tokens are rendered **verbatim** (I18N-009). They are data, not
text. There is no `t()` call for them, and no case-folding in the display layer.

```tsx
<span className="font-mono tracking-wider">{ticket.plateId}</span>
```

A monospace font with wide tracking is used for the reference so that a guard reading it aloud
over the phone does not confuse `O` and `0` — the alphabet already excludes them, but the
typography helps too.

## 7. The status and verdict labels

Every enumerated value gets a translated label, and every label is paired with a **non-colour
marker** (I18N-010):

```jsonc
"guard": {
  "exit": {
    "verdict": {
      "VALID":               { "en": "Ready to exit",           "km": "…" },
      "PAYMENT_PENDING":     { "en": "Payment required",        "km": "…" },
      "PLATE_MISMATCH":      { "en": "Plate does not match",    "km": "…" },
      "ALREADY_COMPLETED":   { "en": "Already exited",          "km": "…" },
      "REVOKED":             { "en": "Ticket was revoked",      "km": "…" },
      "EXPIRED":             { "en": "Ticket expired",          "km": "…" },
      "UNKNOWN":             { "en": "Ticket not found",        "km": "…" },
      "MANUAL_REVIEW_REQUIRED": { "en": "Needs a supervisor",  "km": "…" },
      "NOT_ACTIVE":          { "en": "No active session",       "km": "…" }
    }
  }
}
```

The component renders an icon and the label next to the colour:

```tsx
<VerdictBadge verdict="PLATE_MISMATCH" />
// renders:  ⚠  កម្មងស្លោកមិនត្រឹមគ្នា  (amber background, dark text, warning icon)
```

Colour is a reinforcement, never the signal. A colour-blind guard, a sunlit phone, or a
low-contrast monitor all still convey the meaning.

## 8. The site default language

```jsonc
// parking_sites.settingsJson
{ "defaultLanguage": "km" }
```

The resolution order (I18N-006):

```ts
export async function resolveRequestLocale(req: Request, site?: ParkingSite): Promise<Locale> {
  const pref = req.cookies.get('lang')?.value;               // 1. the explicit preference
  if (pref && isLocale(pref)) return pref;

  const accept = req.headers.get('accept-language');          // 4. the browser
  if (!site) return resolveLocale(accept);                   // 5. the fallback

  const siteLang = site.settingsJson?.defaultLanguage;        // 3. the site default
  return isLocale(siteLang) ? siteLang : resolveLocale(accept);
}
```

**The site default takes precedence over the browser header** for the guard dashboard, so a guard
with an English phone at a Khmer site still sees Khmer.

## 9. The Telegram namespace

The bot reuses the same catalogue with a `telegram.` prefix (P1):

```jsonc
"telegram": {
  "start":       { "en": "Welcome to Chlat Park.", "km": "សូមស្វាគមន៍ មក Chlat Park។" },
  "claim_expired": { "en": "This code has expired. Please ask the guard for a new one.", "km": "…" },
  "ticket_issued":  { "en": "Your ticket for {{plate}} at {{site}}.", "km": "…" }
}
```

The bot resolves the locale from the Telegram user's `language_code` (I18N-006, the channel rule).

## 10. Failure handling

| Failure | Behaviour |
|---|---|
| A key is missing from `km.json` | The English string is used (I18N-004); the parity check fails in CI |
| A key is missing from both | `⟨domain.section.element⟩` is returned — a visible placeholder |
| The `Accept-Language` header is malformed | The request proceeds; the fallback locale is used |
| The `lang` cookie holds an unknown value | It is ignored; the resolution continues down the chain |
| The site's timezone is invalid | The site cannot be created (the timezone is validated at creation) |
| The currency is unknown to the formatter | The minor-unit digit count defaults to 2 and a warning is logged |

## 11. Observability

| Signal | Purpose |
|---|---|
| `i18n_missing_key_total{locale,key}` | A key that fell back — should be zero after the parity check passes |
| `i18n_fallback_total{locale}` | A locale that fell back to English |
| `i18n_parity_check` | A CI result, not a runtime signal |

## 12. Data model

The i18n layer has **no database tables**. It is a set of static JSON files plus a small amount of
per-user preference, and the preference is a cookie rather than a column.

### 12.1 The catalogue files

```
packages/i18n/
├── messages/
│   ├── en.json      # the source of truth for the key set
│   └── km.json      # the Khmer translations
├── index.ts         # the loader, `t()`, `lookup()`, `resolveLocale()`
├── format.ts        # the date, time, number, and money formatters
└── scripts/
    └── check-parity.ts
```

The files are **static and versioned with the code**. A message is a code artefact, reviewed in a
pull request, and rolled out with the release. There is no runtime message store and no
admin UI for editing translations — a parking product does not justify that machinery, and a
reviewed JSON file is easier to audit than a translation table.

### 12.2 The persisted state

| Where | What | Lifetime |
|---|---|---|
| The `lang` cookie | The user's explicit language preference (`en` or `km`) | 1 year, `SameSite=Lax`, not `HttpOnly` (the client reads it) |
| `parking_sites.settingsJson.defaultLanguage` | The site's default language | With the site |
| `telegram_identities.languageCode` | The Telegram user's language | With the identity |
| The `Accept-Language` header | The browser's preference | Per request, never stored |

**Nothing about the locale is personal data** beyond a language preference, and the preference
cookie holds one of two values.

### 12.3 The key shape

```jsonc
{
  "guard": {
    "entry": {
      "title": { "en": "Vehicle entry", "km": "ចូលយានយន្ត" }
    }
  }
}
```

The leaf value is **an object keyed by locale**, not a nested locale tree. The reason is
ergonomic: a translator opening `en.json` and `km.json` side by side reads the same paths, and
the parity check compares two flat key sets derived from the same structure. A locale-keyed
nesting would mean the Khmer file's key paths differ from the English file's, which makes the
side-by-side comparison harder and the parity check noisier.

The `t()` helper reads a **single** locale at a time and takes a dotted key path. The catalogue is
therefore loaded per locale, and the resolution is a simple object walk.

## 13. Security considerations

Localisation is not a security-sensitive feature, but three of its properties intersect with
security.

| Consideration | Decision |
|---|---|
| **The `Accept-Language` header is attacker-controlled** | It is used only to pick a locale. It is validated against the `LOCALES` allowlist, it is never interpolated into a query, and it never influences a permission decision or a data-access path. A malformed header falls back to `en`. |
| **The `lang` cookie is client-controlled** | It holds one of two known values, and an unknown value is ignored rather than trusted. It cannot widen a scope, grant a permission, or select a different data set. It is **not** a credential. |
| **The message catalogue is code, not user input** | The strings are reviewed in a pull request. A string is never rendered as HTML — the components use text nodes, and the CSP forbids inline script. A translation cannot introduce an injection. |

**The interpolation is the one risk.** A placeholder value is substituted into a translated
string. If a placeholder's *value* is attacker-controlled — for example, a plate ID or a site
name — then a translation containing markup could turn that value into markup. The mitigations:

* the values are rendered as **text nodes**, never as HTML;
* the `t()` helper does a plain string replacement, and the result is a string, not a template;
* the components never use `dangerouslySetInnerHTML` (a lint rule bans it);
* the CSP has no `unsafe-inline`.

**A missing translation is a visible defect, not a security hole.** The fallback is the English
string, and the ultimate fallback is a `⟨key⟩` placeholder — never an empty string, which would
hide the defect.

**The locale must not become a covert channel.** The locale is a display concern only. It never
changes which data a caller can see, how a value is stored, or how a comparison is made. The
plate comparison in particular is locale-independent: the normalized plate is compared as a
string, and the display is a separate concern.

## 14. Alternatives considered

| Alternative | Why rejected |
|---|---|
| Hard-coded strings with a `t()` wrapper that returns the input | The parity check cannot detect a missing key, and the English default silently ships. |
| A translation service (Phrase, Lokalise) | Overkill for two locales and a small team. The JSON files are the source of truth. |
| Shipping the whole catalogue to the browser | Bundle size, and it exposes the API's internal wording. |
| Translating identifiers | A plate is data. Translating it would break the comparison with the physical plate. |
| Using the browser's locale for the guard dashboard | A guard's phone settings have nothing to do with the site. The site default wins. |
| A single "km" file with the English text as a fallback | The parity check needs both files to be explicit. |
