# Chlat-Park — Team Workflow

> **Two developers, one repository, one contract.**
>
> This document says who owns what, what they must not touch, how they hand
> work to each other, and in which order they should work so neither blocks
> the other.

**Status:** Agreed
**Last updated:** 2026-10-21
**Related:** [`../README.md`](../README.md) · [`../AGENTS.md`](../AGENTS.md) ·
[`admin-api-contract.md`](./admin-api-contract.md) ·
[`../specs/README.md`](../specs/README.md)

---

## 1. The split

| | **vireaboth** | **kitya** |
|---|---|---|
| **Role** | Frontend engineer | Full-stack engineer |
| **Owns** | The **super admin console** — `/admin/*` only | The **NestJS API** (everything) + every **non-admin** web surface |
| **App** | `apps/web/src/app/[locale]/(admin)/**` | `apps/api/**` and `apps/web/src/app/[locale]/{(guest),(guard),(owner)}/**` |
| **Surface** | Revenue dashboard, adoption/users dashboard, platform site/user/owner management, platform audit viewer | Guard dashboard, guest ticket flow, owner dashboard, and the whole API behind them |
| **Does NOT touch** | `apps/api/**`, the `(guest)` / `(guard)` / `(owner)` route groups, the Prisma schema, the permission catalogue | `apps/web/src/app/[locale]/(admin)/**` and the admin console's components |

### 1.1 Why the split is clean

The admin console is the only surface in the product that talks to
**`platform.*` permissions** — permissions no other role holds. It is
therefore also the only surface that can be built against a **fixed,
read-mostly contract** without waiting for the operational domain to exist.

Everything else — the entry/exit flow, the guard's tools, the owner's
reports — depends on the parking-session state machine, the pricing engine
and the payment ledger. That is a chain, and it belongs to one person.

---

## 2. The responsibility table

| Area | vireaboth | kitya |
|---|:---:|:---:|
| `apps/web/src/app/[locale]/(admin)/**` | ● | |
| The admin console's components (`src/components/admin/**`) | ● | |
| The admin console's hooks and state | ● | |
| `apps/web/src/app/[locale]/(guest)/**` | | ● |
| `apps/web/src/app/[locale]/(guard)/**` | | ● |
| `apps/web/src/app/[locale]/(owner)/**` | | ● |
| `apps/web/src/lib/api/**` (the shared fetch wrapper) | | ● |
| `apps/web/src/lib/auth/**` | | ● |
| `apps/web/src/lib/i18n/**` | | ● |
| `apps/web/src/messages/**` | ◐ | ◐ |
| `apps/web/src/styles/**`, `next.config.ts`, `postcss.config.mjs` | | ● |
| `apps/web/src/proxy.ts` | | ● |
| `apps/api/**` | | ● |
| `apps/api/prisma/schema.prisma` | | ● |
| `packages/contracts/src/routes/**` | ◐ | ◐ |
| `packages/contracts/src/schemas/admin.ts` | | ● |
| `packages/contracts/src/schemas/parking.ts`, `ticket.ts`, `payment.ts` | | ● |
| `packages/contracts/src/permissions.ts` | | ● |
| `packages/api-client/**` | | ● |
| `packages/ui/**` | ◐ | ◐ |
| `specs/**` | | ● |
| `docs/**` | ◐ | ◐ |
| `docker-compose.yml`, `.github/workflows/**`, the root manifests | | ● |

**●** = owns · **◐** = may change, but must coordinate (see §4)

### 2.1 The "does not touch" rules, spelled out

**vireaboth does not:**

* edit anything under `apps/api/`;
* edit the Prisma schema, a migration, or a seed script;
* change the permission catalogue, the role grants, or the scope model;
* edit the admin console's API calls in a way that changes a **shape** — a
  shape change goes through §4 first;
* add an admin route that is not in
  [`admin-api-contract.md`](./admin-api-contract.md);
* re-implement a domain rule in the browser (see §5).

**kitya does not:**

* edit anything under `apps/web/src/app/[locale]/(admin)/**`;
* edit the admin console's components;
* change a response **shape** that the admin contract already defines
  without landing the contracts change first.

### 2.2 The shared files, and how to avoid a conflict

Four areas are genuinely shared. The rule for each:

| Shared area | Rule |
|---|---|
| `src/messages/{en,km}.json` | **Additive only.** Each developer adds keys under their own namespace and never removes or rewords another person's keys. A merge conflict in this file is resolved by taking **both** sides. |
| `packages/contracts` | The **integration point**. Changes land in `main` first (§4). |
| `packages/ui` | Additive only. A new shared primitive is added by whoever needs it, and the other developer consumes it later. |
| `docs/**` | Additive only. |

---

## 3. The contract between them

This is the part that makes the two halves work. **vireaboth's console calls
endpoints that kitya implements.** The full definition — method, path,
permission, query parameters, request body, response shape, error cases — is
in [`admin-api-contract.md`](./admin-api-contract.md). This section is the
summary and the working agreement.

### 3.1 The endpoint index

| Method | Path | Permission | Console panel |
|---|---|---|---|
| GET | `/api/v1/admin/revenue` | `platform.revenue.read` | Revenue dashboard |
| GET | `/api/v1/admin/adoption` | `platform.analytics.read` | Adoption / users dashboard |
| GET | `/api/v1/admin/sites` | `platform.sites.read` | Platform site management |
| POST | `/api/v1/admin/sites` | `platform.sites.create` | Platform site management |
| DELETE | `/api/v1/admin/sites/{siteId}` | `platform.sites.deactivate` | Platform site management |
| GET | `/api/v1/admin/owners` | `platform.owners.read` | Platform owner management |
| POST | `/api/v1/admin/owners` | `platform.owners.create` | Platform owner management |
| POST | `/api/v1/admin/owners/{ownerId}/suspend` | `platform.owners.suspend` | Platform owner management |
| GET | `/api/v1/admin/users` | `platform.users.read` | Platform user management |
| POST | `/api/v1/admin/users/{userId}/suspend` | `platform.users.suspend` | Platform user management |
| GET | `/api/v1/admin/audit` | `platform.audit.read` | Platform audit viewer |
| POST | `/api/v1/admin/audit/export` | `platform.audit.read` **+** `platform.audit.export` | Platform audit viewer |

### 3.2 The response envelope, in full

Every response — success and failure — has this shape:

```json
{ "success": true, "data": { }, "message": null, "error": null }
```

```json
{ "success": false, "data": null, "message": "…", "error": { "code": "…", "message": "…", "details": null, "requestId": "…" } }
```

**The working agreement:** the console's data layer unwraps the envelope
once, in one place (`src/lib/api/client.ts`, owned by kitya). Above that
point the console only ever sees `data` or an `ApiError`. The console
branches on `error.code` — never on the HTTP status alone, and never on
`error.message` (which may be reworded).

### 3.3 The error codes the console handles

| Code | Status | What the console does |
|---|---|---|
| `AUTH_TOKEN_EXPIRED` | 401 | Refresh the token and retry once. |
| `AUTH_TOKEN_MISSING` | 401 | Redirect to the sign-in page. |
| `AUTHZ_PERMISSION_DENIED` | 403 | Show "you do not have access to this". Never a blank screen. |
| `AUTHZ_SCOPE_DENIED` | 403 | Same. |
| `VALIDATION_FAILED` | 400 | Show `error.details` next to the field. |
| `NOT_FOUND` | 404 | An empty state, not an error page. |
| `CONFLICT` | 409 | Show the message; the user must change something. |
| `RATE_LIMITED` | 429 | Show "try again shortly" and honour `Retry-After`. |
| `SERVICE_UNAVAILABLE` | 503 | Show a retry affordance. |

### 3.4 The two hard rules of the console

These are the rules that, if broken, make the console *lie* to the platform
operator.

**Rule 1 — `EXEMPT` and `VOIDED` stay separate.**
An exemption is revenue *leakage*. A void is a *correction*. Neither is
revenue, and folding either into a "total" is how leakage survives. The
console shows `collectedMinor`, `exemptMinor`, `voidedMinor` and `failedCount`
as four distinct figures, and never computes a net revenue.

**Rule 2 — no raw plate, ever.**
The adoption panel is built from aggregates. The API never returns a
`plate_digest` and the console must never try to reconstruct one. The
console labels the counts "distinct guests" / "distinct plates", never
"users" — a person with two motorcycles counts twice.

### 3.5 The three rules of the API side

**Rule 1 — deny by default.** A route with no `@RequirePermissions()` and no
`@Public()` returns 403. The admin endpoints in §3.1 all carry explicit
permissions.

**Rule 2 — the platform scope is a scope, not a bypass.** The super admin is
evaluated by the same check function as everybody else.

**Rule 3 — every state change is audited.** Creating an owner, creating a
site, suspending a user or an owner, deactivating a site, exporting the
audit log: each writes an audit row with the actor, the target and the
reason.

### 3.6 The working rhythm

| When | What |
|---|---|
| **Monday** | 15-minute sync. The contract changed? The plan changed? Say it out loud and write it into [`admin-api-contract.md`](./admin-api-contract.md) the same day. |
| **Whenever a shape changes** | The contracts change lands in `main` first (§4). The console is updated against the regenerated client. |
| **Whenever a permission changes** | The catalogue in `packages/contracts/src/permissions.ts` changes first, then the API route, then the console's button visibility. |
| **Before a release** | Both run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. |

---

## 4. The git strategy

### 4.1 The branches

```
main                    ← the integration branch. Always green.
├── feature/vireaboth/admin-revenue
├── feature/vireaboth/admin-adoption
├── feature/vireaboth/admin-sites
├── feature/vireaboth/admin-owners-users
├── feature/vireaboth/admin-audit
├── feature/kitya/api-auth
├── feature/kitya/api-parking-sessions
├── feature/kitya/api-claim-ticket
├── feature/kitya/api-payments
├── feature/kitya/web-guard
├── feature/kitya/web-ticket-claim
├── feature/kitya/web-owner
└── feature/contracts-*    ← a contract change, owned by whoever needs it
```

**Nobody commits to `main` directly** except a contract change that the
other person is waiting on. Everything else goes through a pull request.

### 4.2 Why the branch names are namespaced

The prefix tells you who owns the branch and therefore who reviews it. A
reviewer who is not the owner of the branch is the right reviewer: the two
halves review each other, and neither reviews their own work.

### 4.3 `packages/contracts` is the integration point

`packages/contracts` is the only package both people touch, so it needs a
rule that does not depend on timing.

> **A contract change lands in `main` FIRST. Then both branches rebase on
> `main` and pick it up.**

The sequence:

```
1. kitya opens a PR that changes packages/contracts only.
2. It is reviewed and merged into main. main is green.
3. vireaboth rebases onto main:  pnpm openapi:types   → the client is regenerated.
4. vireaboth's branch now compiles against the new shape.
```

A branch that changes a contract **and** the code that consumes it is
rejected in review: split it. The contract lands first, on its own, so the
other person is never blocked by an unreviewed shape.

### 4.4 The `main` branch rules

* `main` is always green: `pnpm lint`, `pnpm typecheck`, `pnpm test` and
  `pnpm build` all pass.
* The CI workflow (`.github/workflows/ci.yml`) enforces this on every pull
  request.
* A merge to `main` is a squash merge, so the history stays readable and
  the branch is deleted afterwards.

### 4.5 The conflict zones, and how to avoid them

| File | Conflict likelihood | How to avoid it |
|---|---|---|
| `src/messages/{en,km}.json` | **High** | Additive only. Each dev owns a namespace: `admin.*` for vireaboth, everything else for kitya. Never reword another person's key. |
| `packages/contracts/src/schemas/admin.ts` | Medium | kitya owns it. vireaboth requests a change, it lands in `main` first. |
| `packages/contracts/src/permissions.ts` | Medium | kitya owns it. A new `platform.*` permission is added with the route that needs it. |
| `packages/ui/**` | Low | Additive only. |
| `apps/web/src/lib/api/client.ts` | Low | kitya owns it. vireaboth consumes `apiFetch`; if the console needs a new capability, it is added to the shared wrapper, not duplicated in the console. |
| `apps/web/src/app/[locale]/layout.tsx` | Low | kitya owns it. It is the shared chrome (header, footer, providers). |

---

## 5. The rule that applies to both of them

> **Domain rules live in the backend. Never duplicate them in Next.js.**

A button may be hidden because the actor lacks the permission — that is UX.
But the *decision* is always the API's:

* whether a ticket is valid → the API;
* whether a fee is right → the API;
* whether a claim has expired → the API;
* whether this site is in the actor's scope → the API;
* whether a session may be closed → the API.

If the console computes any of these, the two will eventually disagree, and
the console will be the one that is wrong — because the API is the one the
specification describes. (See `specs/README.md` §1, rules 4 and 5.)

**Concretely, for the admin console:** the console may *display* the
`claimRate` the API computed. It may **not** compute `tickets / sessions`
itself from a session list. There is no endpoint that returns a session list
for the console to compute from, and that is deliberate.

---

## 6. The recommended order of work

The two orders are designed so that neither person waits for the other.

### 6.1 vireaboth — the admin console

| # | Task | Depends on | Why this order |
|---|---|---|---|
| 1 | **Read** `admin-api-contract.md`, `specs/features/admin-console/spec.md` and `design.md` | — | The contract is the source of truth. |
| 2 | **The shell**: the admin layout, the navigation between the four panels, the shared panel components (a `MetricCard`, a `DataTable`, a `DateRangePicker` limited to 366 days, an `EmptyState`, an `ErrorState`) | — | Everything else is built from these. |
| 3 | **The data layer**: a typed hook per endpoint, the envelope unwrapping, the error mapping from §3.3, the loading / empty / error states. Use `apiFetch` from `@/lib/api/client`. | 2 | The console must be able to render *something* before any endpoint exists. Point the hooks at the contract's paths; the calls fail with a 404 until kitya lands them, and the error state handles it. |
| 4 | **The revenue panel** — the five figures, the per-site and per-owner breakdowns, the time series, the uncaptured warning. | 3 | The highest-value panel, and the one with the two hard rules. Get the *display* right before the data is live. |
| 5 | **The adoption panel** — the counts, the funnel with the rates, the registered-vs-guest split, the monthly trend. | 3 | |
| 6 | **The platform management panels** — sites, owners, users: the lists, the create/suspend forms, the confirmation dialogs. | 3 | These need the CRUD endpoints, which land after the read endpoints. |
| 7 | **The audit viewer** — the filterable table, the pagination, the export. | 6 | The export needs the second permission; it is the last thing that lands. |
| 8 | **The states**: the empty states, the error states, the loading skeletons, the "no data in this period" case. | 4–7 | Polish, but required by the DoD. |
| 9 | **The accessibility and i18n pass**: the Khmer translations for every admin key, the keyboard navigation, the screen-reader labels. | 8 | The Khmer catalogue must be complete — the admin console is used by the platform operator, who works in Khmer. |

### 6.2 kitya — the API and the parking surfaces

| # | Task | Depends on | Why this order |
|---|---|---|---|
| 1 | **Read** `specs/architecture/rbac-design.md`, `specs/security/access-control-matrix.md`, `specs/data/schema.md` | — | |
| 2 | **The full Prisma schema** — every model in `specs/data/schema.md`, with the `plate_digest` column, the fee snapshot on the session, and the audit log. | 1 | Everything else queries it. |
| 3 | **The auth module** — `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, the JWT strategy, the refresh-token rotation with reuse detection, Argon2id. | 2 | Every other endpoint needs an actor. |
| 4 | **The authorization module** — the `AuthorizationService` (the fine layer from the DB), the `ScopeResolver`, the per-user grant overrides, the `authzVersion` cache. | 3 | The skeleton has the coarse layer; this is the fine layer. |
| 5 | **The site, owner and pricing modules** — the CRUD, the pricing-policy versions, the fee calculation. | 2, 4 | |
| 6 | **The parking-session module** — the state machine, the entry QR issuance, the claim, the ticket, the exit. | 5 | The core of the product. |
| 7 | **The payments module** — the fee snapshot at exit, the manual cash recording, the exemption with a reason, the void. | 6 | The revenue figures depend on the payment states. |
| 8 | **The admin endpoints** — `/admin/revenue`, `/admin/adoption`, then the platform management and the audit viewer. | 7 | The revenue and adoption queries need the payments and the sessions to exist. **These are what vireaboth is waiting for** — so they come as early as the data allows, and the contract in `admin-api-contract.md` is the specification. |
| 9 | **The guard web surface** — the login, the site dashboard, the entry form, the ticket verification. | 6 | |
| 10 | **The guest ticket-claim surface** — the camera scan, the manual code entry, the ticket display. | 6 | |
| 11 | **The owner web surface** — the site list, the site report, the pricing and the staff management. | 7 | |
| 12 | **The audit module** — the audit writes on every privileged action, the audit viewer, the export. | 8 | |

### 6.3 The parallelisation, in one picture

```
Week 1    kitya: schema + auth          vireaboth: shell + design system + data layer
Week 2    kitya: authorization + sites  vireaboth: revenue panel (against the contract)
Week 3    kitya: sessions + payments    vireaboth: adoption panel
Week 4    kitya: admin endpoints ★      vireaboth: management panels + audit viewer
Week 5+   kitya: guard/guest/owner UI   vireaboth: states, a11y, i18n polish
```

★ **The admin endpoints are the one place where vireaboth is genuinely
blocked.** vireaboth can build and review the whole console against the
contract, but the panels show empty states until the endpoints exist. The
mitigation is to agree the contract *now* (it is agreed, in
`admin-api-contract.md`) and to keep the shapes stable.

---

## 7. The definition of done

The shared Definition of Done is in [`../specs/README.md`](../specs/README.md) §5.
It applies to both of them. In addition:

### 7.1 vireaboth's DoD

- [ ] Every panel renders from a real API response — no hard-coded numbers,
      no mocked data left in the code.
- [ ] `EXEMPT` and `VOIDED` are shown as separate, prominent figures, and no
      net-revenue figure exists anywhere in the console.
- [ ] The uncaptured-payment warning appears when the API reports
      `uncapturedPaymentCount > 0`.
- [ ] No component renders a plate, a `plate_digest`, or a "users" label for
      a distinct-plate count.
- [ ] The date picker cannot select a range longer than 366 days, and a
      `VALIDATION_FAILED` from the API is handled.
- [ ] Every error state maps the API's `error.code` to a message; no raw
      error object is rendered.
- [ ] The loading, empty and error states exist for every panel.
- [ ] Every admin string has a Khmer translation in `src/messages/km.json`.
- [ ] The console is keyboard-navigable and the screen-reader labels are
      correct.
- [ ] The console's own route (`/[locale]/(admin)/**`) is the only thing
      under `apps/web` that this task touched.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.

### 7.2 kitya's DoD

- [ ] Every endpoint in `admin-api-contract.md` is implemented, and it is
      declared in `packages/contracts` with the same path, method, permission
      and response shape.
- [ ] The route-audit test passes: every route declares
      `@RequirePermissions(...)` or `@Public()`, and every `@Public()` route
      is on the reviewed allowlist.
- [ ] The API-boundary authorization tests pass: a valid token with the
      wrong permission is rejected with 403; a valid token with the wrong
      scope is rejected with 403; an un-annotated route is rejected.
- [ ] `GET /admin/revenue` returns `collectedMinor`, `exemptMinor`,
      `voidedMinor`, `failedCount`, `uncollectedMinor`, the per-site and
      per-owner breakdowns and the time series — and the `EXEMPT` and
      `VOIDED` amounts are **not** included in `collectedMinor`.
- [ ] `GET /admin/adoption` returns the registered count, the distinct-guest
      count, the active count, the funnel with the rates, the repeat rate,
      the registered-vs-guest split, the per-site and per-owner breakdowns
      and the monthly trend — and **no response field contains a
      `plate_digest`**.
- [ ] A range longer than 366 days is rejected with 400
      `VALIDATION_FAILED`.
- [ ] Every privileged state change writes an audit row with the actor.
- [ ] The migration and its rollback are documented in
      `specs/data/migrations.md`.
- [ ] The logs contain no raw ticket token, claim token, credential or
      unnecessary personal data.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass.

### 7.3 The shared DoD, restated

From `specs/README.md` §5 — a feature is merged only when:

1. all acceptance criteria pass;
2. the unit and integration tests pass;
3. the relevant e2e tests pass (against a real database);
4. lint, typecheck and build pass for the affected applications;
5. **authorization is tested at the API boundary** — a request with a valid
   token but the wrong scope must be rejected;
6. the migrations and their rollback are documented;
7. the logs leak no credential and no unnecessary personal data;
8. the loading, error, empty and offline states are handled;
9. the documentation and the OpenAPI contracts are updated, and the OpenAPI
   drift check passes;
10. the specs and ADRs match the shipped behaviour;
11. the code review is approved;
12. it is deployed to staging and smoke-tested.

---

## 8. The anti-patterns, in one list

| Anti-pattern | Why it is wrong | The rule |
|---|---|---|
| The console computes `claimRate` from a session list | The API is the authority; a second implementation will drift | §5 |
| The console hides a button instead of the API rejecting the call | A hidden button is not authorization | §3.6 / `specs/README.md` rule 5 |
| `EXEMPT` folded into a "total revenue" | It hides revenue leakage | §3.4 rule 1 |
| A per-plate list in the console | Plate data belongs to the motorcycle owner | §3.4 rule 2 |
| A contract change and its consumer in one PR | The other person is blocked by an unreviewed shape | §4.3 |
| A branch named `feature/admin-dashboard` | Nobody knows who reviews it | §4.1 |
| Reformatting `src/messages/*.json` | It creates a conflict for no reason | §2.2 |
| A super-admin shortcut in the guard | A shortcut is a permanent bypass | §3.5 rule 2 |
| Committing to `main` directly | `main` must stay green | §4.4 |

---

## 9. The quick reference

| I want to… | Look at |
|---|---|
| Know what the console calls | [`admin-api-contract.md`](./admin-api-contract.md) §15 |
| Know what a permission means | [`../specs/security/access-control-matrix.md`](../specs/security/access-control-matrix.md) §3 |
| Know the revenue definitions | [`admin-api-contract.md`](./admin-api-contract.md) §2.3 |
| Know the adoption definitions | [`admin-api-contract.md`](./admin-api-contract.md) §3.3 |
| Know what "done" means | [`../specs/README.md`](../specs/README.md) §5 |
| Know how to branch | This file, §4 |
| Know what I must not touch | This file, §2.1 |
| Know the feature's requirements | [`../specs/features/admin-console/spec.md`](../specs/features/admin-console/spec.md) |
| Know the feature's design | [`../specs/features/admin-console/design.md`](../specs/features/admin-console/design.md) |
| Know how authorization works | [`../specs/architecture/rbac-design.md`](../specs/architecture/rbac-design.md) |
