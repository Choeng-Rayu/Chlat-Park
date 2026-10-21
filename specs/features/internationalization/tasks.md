# Internationalization — Tasks

**Status:** In progress
**Requirement IDs:** I18N-001 … I18N-010

---

## Phase A — The catalogue

- [ ] **T-A1 — The i18n package.**
  Satisfies: I18N-002.
  Files: `packages/i18n/package.json`, `packages/i18n/index.ts`.
  Notes: `LOCALES`, `isLocale`, `resolveLocale`, `t`, `lookup`.

- [ ] **T-A2 — `messages/en.json`.**
  Satisfies: I18N-001, I18N-002.
  Files: `packages/i18n/messages/en.json`.
  Notes: the `common`, `guard`, `ticket`, `owner`, `admin` namespaces; the `telegram` namespace is
  added in the P1 phase.

- [ ] **T-A3 — `messages/km.json`.**
  Satisfies: I18N-001, I18N-002.
  Files: `packages/i18n/messages/km.json`.
  Notes: the Khmer translations; the key set is identical to `en.json`.

- [ ] **T-A4 — The key-parity check script.**
  Satisfies: I18N-003.
  Files: `packages/i18n/scripts/check-parity.ts`.
  Notes: the script from `design.md` §3; it reports the missing keys on both sides.

- [ ] **T-A5 — The CI wiring.**
  Satisfies: I18N-003.
  Files: `.github/workflows/ci.yml`.
  Notes: the parity check runs on every pull request, before the build.

## Phase B — The web app

- [ ] **T-B1 — The server-side loader.**
  Satisfies: I18N-006.
  Files: `apps/web/src/lib/i18n/server.ts`.
  Notes: `getTranslations(namespace)`; the locale resolution chain from `design.md` §8.

- [ ] **T-B2 — The client-side loader.**
  Satisfies: I18N-006.
  Files: `apps/web/src/lib/i18n/client.tsx`.
  Notes: `useTranslations(namespace)`; the resolved namespace object is passed to the client.

- [ ] **T-B3 — The language switcher.**
  Satisfies: I18N-006.
  Files: `apps/web/src/components/LanguageSwitcher.tsx`.
  Notes: it sets the `lang` cookie and refreshes the route; the cookie is not `HttpOnly`.

- [ ] **T-B4 — The date, time, and money formatters.**
  Satisfies: I18N-007, I18N-008.
  Files: `apps/web/src/lib/format.ts`, `packages/i18n/format.ts`.
  Notes: the site timezone for the display; the minor-unit conversion for the money.

- [ ] **T-B5 — The status and verdict labels.**
  Satisfies: I18N-010.
  Files: `packages/i18n/messages/*.json`, `apps/web/src/components/VerdictBadge.tsx`.
  Notes: a label for every verdict, session status, payment status, and ticket status; an icon
  alongside the label.

- [ ] **T-B6 — Replace the hard-coded strings.**
  Satisfies: I18N-001.
  Files: all the web pages and components.
  Notes: the CI check for a hard-coded string is a lint rule or a review checklist item.

## Phase C — The API

- [ ] **T-C1 — The locale from the request.**
  Satisfies: I18N-005, I18N-006.
  Files: `apps/api/src/common/i18n/locale.middleware.ts`, `locale.ts`.
  Notes: the `Accept-Language` header; the `lang` cookie; the site default where known.

- [ ] **T-C2 — The error messages.**
  Satisfies: I18N-005.
  Files: `apps/api/src/common/filters/all-exceptions.filter.ts`.
  Notes: the `message` is resolved from the catalogue; the `code` is unchanged.

- [ ] **T-C3 — The fallback placeholder.**
  Satisfies: I18N-004.
  Files: `packages/i18n/index.ts`.
  Notes: `⟨key⟩` when a key is missing everywhere; a metric for the fallback.

## Phase D — Verification

- [ ] **T-D1 — The parity test.**
  Satisfies: I18N-003.
  Files: `packages/i18n/scripts/check-parity.ts` (also run as a Jest test).
  Notes: a fixture that removes a key from `km.json` and asserts the check fails.

- [ ] **T-D2 — The `t()` unit test.**
  Satisfies: I18N-004.
  Files: `packages/i18n/index.spec.ts`.
  Notes: the interpolation; the English fallback; the missing-key placeholder; the unknown locale.

- [ ] **T-D3 — The locale resolution test.**
  Satisfies: I18N-006.
  Files: `apps/web/e2e/locale.spec.ts` (Playwright).
  Notes: the preference cookie wins; the site default beats the browser header.

- [ ] **T-D4 — The formatting test.**
  Satisfies: I18N-007, I18N-008, I18N-009.
  Files: `packages/i18n/format.spec.ts`.
  Notes: the site timezone; the minor-unit conversion; a plate rendered verbatim.

- [ ] **T-D5 — The guard dashboard in Khmer.**
  Satisfies: I18N-001, I18N-010.
  Files: `apps/web/e2e/guard-khmer.spec.ts` (Playwright).
  Notes: the entry and exit screens render the Khmer strings; the verdict label is accompanied by a
  non-colour marker.
