# Chlat-Park — Agent Context Index

> This file lives in the repository root to keep agent context **local to this repository**.
> When working on Chlat-Park, read the files listed here first.

---

## Quick Start

When starting work on this repository, read these files **in this order**:

1. [`specs/README.md`](specs/README.md) — the SDD loop, the requirement-ID namespace, the DoR and the DoD
2. [`README.md`](README.md) — the product, the quick start, the stack
3. [`docs/TEAM-WORKFLOW.md`](docs/TEAM-WORKFLOW.md) — **who owns what**, and the contract between them
4. `packages/contracts/src/permissions.ts` — the permission catalogue (the source of truth for "what may be done")
5. `packages/contracts/src/routes/` — the route registry (every route, its permission, its shape)
6. `apps/api/src/app.module.ts` — the API's module graph and its global guards
7. `apps/api/prisma/schema.prisma` — the database schema (Prisma 7)
8. `apps/web/src/lib/i18n/` — the locale configuration, the routing and the request config
9. The relevant feature spec: `specs/features/<feature>/spec.md` → `design.md` → `tasks.md`

Then read the feature's specs for the task at hand. **Do not start from the code.**

---

## Module Index

### `apps/api` — the NestJS 12 API (ESM)

All implementation is under `src/`:

| Directory | Purpose | Key files |
|---|---|---|
| `src/config/` | The Zod-validated environment. The process refuses to start when it is invalid. | `env.ts` |
| `src/common/auth/` | The actor context and the access-token payload. | `actor.ts` |
| `src/common/authorization/` | The `AuthorizationService` — the single check function every role passes through. | `authorization.service.ts` |
| `src/common/decorators/` | `@Public()` and `@RequirePermissions(...)`. | `public.decorator.ts`, `require-permissions.decorator.ts` |
| `src/common/errors/` | The error-code registry and the domain exception. | `error-codes.ts`, `api-exception.ts` |
| `src/common/filters/` | The global exception filter — every failure becomes the same envelope. | `all-exceptions.filter.ts` |
| `src/common/guards/` | `JwtAuthGuard` (who) and `PermissionsGuard` (what) — **deny by default**. | `jwt-auth.guard.ts`, `permissions.guard.ts` |
| `src/common/interceptors/` | The `{ success, data, message, error }` envelope. | `transform.interceptor.ts` |
| `src/common/pipes/` | The Zod validation pipe. | `zod-validation.pipe.ts` |
| `src/modules/health/` | The two public probes. | `health.controller.ts`, `health.service.ts` |
| `src/prisma/` | The Prisma service (Prisma 7 driver adapter) and its global module. | `prisma.service.ts`, `prisma.module.ts` |
| `prisma/` | The schema, the migrations and the seed. | `schema.prisma`, `prisma.config.ts` |
| `test/` | The e2e suite, including the deny-by-default proof. | `app.e2e.test.ts` |

Feature modules live under `src/modules/<feature>/` and are added as the domain is built.

### `apps/web` — the Next.js 16 web app

| Directory | Purpose |
|---|---|
| `src/app/layout.tsx` | The root layout — a pass-through. The `<html>` element is rendered by the locale layout. |
| `src/app/[locale]/layout.tsx` | The locale layout: owns `<html lang>`, the providers, the header and the footer. |
| `src/app/[locale]/(guest)/` | The guest surfaces — the ticket claim. |
| `src/app/[locale]/(guard)/` | The guard surfaces — the login and the site dashboard. |
| `src/app/[locale]/(owner)/` | The owner surfaces — the site list and the reports. |
| `src/app/[locale]/(admin)/` | **The admin console. Owned by vireaboth.** |
| `src/lib/i18n/` | `config.ts` (the locales), `routing.ts`, `request.ts`, `navigation.ts`. |
| `src/lib/api/client.ts` | The typed fetch wrapper over `@chlat/api-client`. |
| `src/lib/auth/session.ts` | Reading the HttpOnly cookie, and the sign-out action stub. |
| `src/messages/` | `en.json` and `km.json`. The key convention is `guard.entry.title`, `ticket.claim.heading`, `admin.dashboard.revenue`. |
| `src/proxy.ts` | The locale router. Next 16 renamed `middleware.ts` to `proxy.ts`. |
| `src/styles/globals.css` | Tailwind v4. The theme is declared here, in `@theme`. |

### `packages/`

| Package | Purpose |
|---|---|
| `contracts` | The Zod schemas, the permission catalogue, the route registry and the OpenAPI document. **The single source of truth for the contract.** |
| `api-client` | The typed HTTP client, generated from `specs/api/openapi.yaml`. |
| `ui` | The shared React primitives. |
| `config` | The shared TypeScript, ESLint and Prettier configuration. |

---

## The rules that are not negotiable

### 1. Domain rules live in the backend. Never duplicate them in Next.js.

A button may be hidden because the actor lacks the permission — that is UX. The **decision** is
always the API's: whether a ticket is valid, whether a fee is right, whether a claim expired,
whether a site is in scope, whether a session may close. If the web app computes any of these,
the two will eventually disagree, and the web app will be the one that is wrong.

### 2. Never claim tests passed unless you ran them.

Report the exact command and its actual output. If a suite was not run, say so. If a test fails,
report the failure — do not describe the intent as if it were the result. "I believe this works"
and "this passes" are very different claims, and only one of them is useful.

### 3. Deny by default.

A route with no `@RequirePermissions(...)` and no `@Public()` returns **403**. There is no
implicit-allow path. If you add a route, add the decorator in the same commit.

### 4. The super admin is not a bypass.

It is the `platform` scope plus a full grant set, evaluated by the identical check function as
every other role. Never write `if (isSuperAdmin) return allow`.

### 5. A contract change lands in `packages/contracts` first.

Never change a response shape in the API without changing the Zod schema in
`packages/contracts` in the same pull request, and never change a shape in the console without
the schema. Then regenerate: `pnpm openapi` and `pnpm openapi:types`.

### 6. Never commit a secret, and never log one.

No ticket token, no claim token, no credential, no raw plate, no `plate_digest`. The digest
never leaves the database.

---

## The requirement-ID convention

Every requirement has a **stable, permanent ID** in the format `<DOMAIN>-<NNN>`. IDs are never
renumbered and never reused.

| Prefix | Domain | Prefix | Domain |
|---|---|---|---|
| `AUTH-` | Authentication | `OWN-` | Owner operations |
| `RBAC-` | Authorization | `ADMIN-` | Platform administration |
| `PARK-` | Parking sites | `TG-` | Telegram |
| `SESSION-` | Parking session | `AUDIT-` | Audit log |
| `CLAIM-` | Entry QR claim | `SYNC-` | Offline sync |
| `TICKET-` | E-ticket | `SEC-` | Cross-cutting security |
| `EXIT-` | Exit verification | `I18N-` | Localisation |
| `PRICE-` | Pricing | `OPS-` | Operations |
| `PAY-` | Payments | | |

**Every change names the requirement IDs it satisfies.** A commit message, a pull-request
description and a test name should all carry them:

```ts
// RBAC-003: a route with no permission metadata is denied
it("denies a route with no permission metadata", () => { … });
```

A change that satisfies no requirement is either a bug fix or a change to the specification. Say
which one it is, in the pull request.

---

## The API conventions

- **Prefix:** `api/v1`, set once by `main.ts` from the contracts' `API_PREFIX`
  (`app.setGlobalPrefix(API_PREFIX)`). **Never** write `api/v1/` inside an
  `@Controller()` — the route becomes `/api/v1/api/v1/…` and silently 404s.
- **Single source of truth:** the prefix is defined in `packages/contracts` and imported by the
  server, the OpenAPI document, the generated client and the web app's fetch wrapper. Do not
  write the literal string in a second place — that is how the server and the client drifted
  apart once already, and every client call 404'd.
- **Envelope:** `{ success, data, message, error }` on every response, success or failure.
- **Error codes:** `error.code` is stable and is what clients branch on. `error.message` is for
  humans and may be reworded. `error.requestId` is the correlation id.
- **Auth:** a bearer JWT in the `Authorization` header, delivered by the API as an HttpOnly
  cookie (`chlat_at`).
- **Validation:** `forbidNonWhitelisted: true` — **every new query parameter must be declared in
  the DTO**, or the request returns 400. The schemas come from `@chlat/contracts`.
- **Money:** integer minor units, never a float. `collectedMinor`, `exemptMinor`, `voidedMinor`.
- **Naming:** `feature.controller.ts`, `feature.service.ts`, `feature.dto.ts`, `feature.module.ts`.

---

## The database notes

- **Schema:** `apps/api/prisma/schema.prisma`. Prisma **7**.
- **Prisma 7 changes:**
  - the `url` is **no longer** allowed in `schema.prisma`. It lives in `apps/api/prisma.config.ts`;
  - the runtime client needs a **driver adapter** — `PrismaPg` from `@prisma/adapter-pg` — passed
    to the `PrismaClient` constructor. There is no `@nestjs/prisma` package for NestJS 12, so
    `src/prisma/prisma.service.ts` is written by hand;
  - `prisma generate` writes to `@prisma/client`'s default location, not to `src/generated/`.
- **Migration policy:** write the SQL by hand, then `prisma migrate deploy`. Prefer
  `migrate deploy` over `migrate dev`. The policy is in `specs/data/migrations.md`.
- **Seed:** `pnpm db:seed`. It is idempotent and materialises the permission catalogue and the
  role grants from `@chlat/contracts` — the catalogue is the source of truth, the database is
  the projection.
- **Timestamps** are `timestamptz(3)`. **Identifiers** are `uuid`. **Nothing is hard-deleted** — a
  row is deactivated, suspended, or redacted.
- **`plate_digest`** is `HMAC-SHA256(pepper, normalized_plate)`. It is indexed, retained for
  lifetime counting, and never leaves the database.

---

## The per-developer ownership map

**Read [`docs/TEAM-WORKFLOW.md`](docs/TEAM-WORKFLOW.md) before you touch anything.** It is the
full working agreement.

| | **vireaboth** | **kitya** |
|---|---|---|
| **Owns** | The **super admin console** (`/admin/*`) | The **NestJS API** (everything) + every **non-admin** web surface |
| **Builds** | The revenue dashboard, the adoption/users dashboard, the platform site/user/owner management, the platform audit viewer | The guard dashboard, the guest ticket flow, the owner dashboard, and the whole API behind them |
| **Owns these paths** | `apps/web/src/app/[locale]/(admin)/**` | `apps/api/**`, `apps/web/src/app/[locale]/{(guest),(guard),(owner)}/**` |
| **Does not touch** | `apps/api/**`, the other route groups, the Prisma schema, the permission catalogue | `apps/web/src/app/[locale]/(admin)/**` and the admin console's components |

**The contract between them:** [`docs/admin-api-contract.md`](docs/admin-api-contract.md) — every
admin endpoint, its method, path, permission, query parameters, body, response shape and error
cases. The API side is kitya's; the console side is vireaboth's.

**The branches:** `feature/vireaboth/admin-*` and `feature/kitya/*`, both off `main`. A change to
`packages/contracts` lands in `main` **first**; both branches then rebase onto it.

---

## The Dev Gotchas

- **`forbidNonWhitelisted: true` is load-bearing.** Every new query parameter must be declared in
  the DTO or the request returns 400. This has broken a lot of clients in this codebase before.
- **NestJS's `ValidationPipe` calls `process.exit(1)` when `class-validator` or
  `class-transformer` is missing.** Both are in the catalog and in `apps/api`'s dependencies. If
  the API dies at boot with "The class-validator package is missing", this is why.
- **The API is ESM with `moduleResolution: "nodenext"`.** Every **relative** import in
  `apps/api` must carry the `.js` extension (`import { x } from "./x.js"`). The web app uses
  `moduleResolution: "bundler"` and must **not** carry the extension. Mixing them up is the
  single most common build failure in this repo.
- **`apps/api/tsconfig.json` has `rootDir: "."` but `tsconfig.build.json` has `rootDir: "src"`.**
  The build config is what `nest build` uses, and it is what makes the output land at
  `dist/main.js` rather than `dist/src/main.js`. `package.json`'s `start` script points at
  `dist/main.js` — do not change one without the other.
- **The envelope interceptor and the exception filter are registered globally in `AppModule`**
  (`APP_INTERCEPTOR`, `APP_FILTER`). Registering them again in a test helper wraps the response
  twice, and the assertions silently fail on a nested `data`.
- **The guards are global and their order matters.** `JwtAuthGuard` is registered before
  `PermissionsGuard`, because the permission guard needs the actor the JWT guard attached. Do
  not add `@UseGuards(JwtAuthGuard)` to a controller — use `@Public()` to opt out.
- **The permission guard reads the metadata from the handler *and* the controller.** A
  controller-level `@Public()` covers every route on it.
- **`getEnv()` caches the validated environment for the lifetime of the process.** A test that
  changes the environment must call `resetEnvCache()`.
- **Prisma 7's `prisma.config.ts` reads the connection string from the environment.** It loads
  the repository root's `.env` itself. The `url` in `schema.prisma` is not allowed.
- **Next 16 makes every request API asynchronous.** `await props.params`, `await cookies()`,
  `await getTranslations()`. A synchronous access is a build error.
- **`middleware.ts` is renamed `proxy.ts` in Next 16**, and it runs on the Node.js runtime only.
  The old convention is deprecated, and having both files is an error.
- **Turbopack is the default builder in Next 16.** Do **not** set `turbopack.root` in a pnpm
  monorepo — it breaks the resolution of `next` itself.
- **Do not run `next lint`.** It was removed in Next 16; linting runs as a separate step
  (`pnpm lint`).
- **The root layout is a pass-through.** The `<html>` element is rendered by
  `src/app/[locale]/layout.tsx`, because only the locale layout knows the `lang` attribute. A
  root layout that hard-codes `lang="en"` mislabels the Khmer pages for screen readers.
- **Every page under `[locale]` must call `setRequestLocale(locale)`.** Without it the whole
  `[locale]` tree becomes dynamic.
- **Use the `Link` from `@/lib/i18n/navigation`, not `next/link`.** It adds the locale prefix.
  A `next/link` to an internal path silently drops the locale.
- **The message files are additive only.** Never reword or remove another person's keys; a
  merge conflict in `src/messages/*.json` is resolved by taking **both** sides.
- **`docs/admin-api-contract.md` is the contract between the two developers.** A shape change
  goes there first, then into `packages/contracts`, then into the implementation.
- **Money is never a float, and `EXEMPT` and `VOIDED` are never netted into revenue.** They are
  leakage and corrections. The admin console shows them as separate figures.
- **Never expose a `plate_digest` or a raw plate list.** The adoption panel is built from
  aggregates.

---

## External references

| File | Purpose |
|---|---|
| [`specs/README.md`](specs/README.md) | The SDD loop, the ID namespace, the DoR and the DoD |
| [`docs/TEAM-WORKFLOW.md`](docs/TEAM-WORKFLOW.md) | The two-developer split and the working agreement |
| [`docs/admin-api-contract.md`](docs/admin-api-contract.md) | The contract between the API and the admin console |
| [`specs/architecture/rbac-design.md`](specs/architecture/rbac-design.md) | The authoritative authorization design |
| [`specs/security/access-control-matrix.md`](specs/security/access-control-matrix.md) | The role × permission × scope table |
| [`specs/data/schema.md`](specs/data/schema.md) | The data model of record |
| [`specs/decisions/`](specs/decisions/) | The ADRs — immutable once accepted |
| [`specs/api/openapi.yaml`](specs/api/openapi.yaml) | The generated API contract — do not hand-edit |
