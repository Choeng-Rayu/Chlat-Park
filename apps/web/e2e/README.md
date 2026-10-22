# The e2e suite

The browser tests for the Chlat-Park web app.

## Running it

The suite drives a **real browser** against a **running stack**, so the stack
has to be up first:

```bash
docker compose up -d          # Postgres, the API and the web app
pnpm --filter @chlat/web test:e2e
```

The compose stack is the only thing that manages the app's lifecycle — the
Playwright config has **no `webServer` block** on purpose, so Playwright never
starts, restarts or stops anything. It only talks to what is already running.

| Variable        | Default                 | What it is                                    |
| --------------- | ----------------------- | --------------------------------------------- |
| `E2E_BASE_URL`  | `http://127.0.0.1:3000` | The web app's origin                           |
| `E2E_API_URL`   | `http://127.0.0.1:3001` | The API's origin                               |
| `CI`            | unset                   | Switches the reporter, the retries and the worker count |

Useful flags:

```bash
pnpm --filter @chlat/web test:e2e -- --headed          # watch it happen
pnpm --filter @chlat/web test:e2e -- --ui               # the Playwright UI
pnpm --filter @chlat/web test:e2e -- --debug           # pause on failure
```

Only **chromium** is configured. Firefox and WebKit are not installed, and
downloading them is not worth the disk for a smoke suite.

## What the suite covers today

The domain features are **not implemented yet** — the web pages are
placeholders and the API only answers `/health/live` and `/health/ready`. The
suite therefore covers exactly what exists:

- **`app-shell.spec.ts`** — the landing page renders in `en` and `km`, the
  `<html lang>` attribute matches the URL, the header links keep the locale
  prefix, the locale switch moves to the other locale **and keeps the path**
  (`/en/ticket/claim` → `/km/ticket/claim`) while the `<html lang>` attribute
  follows, the current locale is marked in the switch, the four placeholder
  pages (`/ticket/claim`, `/guard/login`, `/owner/sites`, `/admin`) mount with
  a heading and without a Next.js error overlay, and an unknown route answers
  `404`.
- **`api-health.spec.ts`** — the API answers the success envelope
  `{ success: true, data: { status: "ok" }, … }` on both health endpoints.

Everything is asserted through the rendered page (roles, headings, the
`lang` attribute, the response status) — never through the internals of a
component, and never through marketing copy that is bound to change.

## What is still blocked

These are the domain scenarios the suite **cannot** cover yet, and the
feature each one is waiting for. Write them when the feature lands, and give
each test the requirement ID of the scenario it covers, so the test and the
spec cannot drift apart.

| Scenario                                                                 | Feature                          | Spec                                                    | Requirement IDs   |
| ------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------- | ----------------- |
| A guard creates a session → the entry QR renders                          | Parking session + entry QR        | `specs/features/parking-session/`, `specs/features/entry-qr-claim/` | `SESSION-*`, `CLAIM-*` |
| A guest claims the entry QR → the e-ticket renders                        | Entry QR claim + guest ticket     | `specs/features/entry-qr-claim/`, `specs/features/guest-ticket/` | `CLAIM-*`, `TICKET-*` |
| A guard scans the ticket → the payment is recorded → the exit completes    | Exit verification + pricing       | `specs/features/exit-verification/`, `specs/features/pricing-and-payment/` | `EXIT-*`, `PAY-*` |
| A completed ticket is refused when it is used again                        | Exit verification                 | `specs/features/exit-verification/`                    | `EXIT-002`, `EXIT-007` |

The requirement IDs live in the `acceptance.feature` file of each feature
directory, next to the scenario they belong to:

- `specs/features/parking-session/acceptance.feature` — `SESSION-001` …
  `SESSION-014`
- `specs/features/entry-qr-claim/acceptance.feature` — `CLAIM-001` …
  `CLAIM-014`
- `specs/features/guest-ticket/acceptance.feature` — `TICKET-001` …
  `TICKET-012`
- `specs/features/exit-verification/acceptance.feature` — `EXIT-001` …
  `EXIT-016`
- `specs/features/pricing-and-payment/acceptance.feature` — `PAY-001` …
  `PAY-012`

A scenario that needs a **camera** (the guest scanning the entry QR) is
covered by the API-level tests, not by the browser: the browser test drives
the manual code entry instead.

## How to add a domain test

1. Put the spec next to the existing ones, in `apps/web/e2e/`.
2. Name the test after the scenario and cite the requirement ID:
   `test("a guard creates a pending session (SESSION-001)", …)`.
3. Use the helpers in `support/harness.ts` — `watchForProblems` to catch a
   page that failed to mount, `nextErrorOverlay` to catch the Next.js error
   overlay.
4. Keep the assertions on rendered output and on the API's answers. The
   browser must never re-implement a rule the API owns.
5. Reset the state the test creates. The suite talks to one database, so a
   test that leaves a session behind breaks the next one.

## Known gaps

- **The API is reached over plain HTTP** in the tests. It is the local
  compose stack, so TLS is out of scope for the suite.
