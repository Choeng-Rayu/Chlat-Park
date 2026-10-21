# Chlat-Park

**E-Ticket Parking** — a manual, guard-assisted motorcycle parking entry and exit system where
the paper ticket is replaced by a QR-linked e-ticket bound to a motorcycle plate and a parking
session. Guests never register: they scan the entry QR, receive an e-ticket on their phone, and
the guard verifies it at the exit. Camera/ANPR plate recognition and barrier automation are
explicitly out of scope — the human gatekeeper stays in the loop.

Chlat-Park is a pnpm + Turborepo monorepo: a NestJS 12 API, a Next.js 16 web app, and a set of
shared packages that hold the contract between them. Every behavioural requirement has a stable
ID and a spec; the code is written against the specs, not the other way round.

---

## The central rule

> **A QR identifies a claim or a ticket. The trusted system decides whether it is valid.**

Nothing is decided by the code that is printed, scanned, or rendered. The entry QR carries an
opaque, single-use, short-lived claim token; the e-ticket carries an opaque ticket token. What
those tokens *mean* — whether the session exists, whether the payment settled, whether the plate
matches, whether the guard is allowed to release the vehicle — is decided by the API, against the
database, every single time. A QR is a reference, never an authority.

This rule has a corollary that governs the whole codebase: **domain rules live in the backend,
never duplicated in Next.js.** The web app renders what the API says; it never re-implements a
rule. (See [`specs/README.md`](specs/README.md) §1, rules 4 and 5.)

---

## Quick start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **≥ 22.12** | The `engines` field pins this. |
| pnpm | **11.9.0** | Pinned by `packageManager`. Install with `npm i -g pnpm@11.9.0`. |
| Docker | any recent | For the PostgreSQL 18 database only. |
| PostgreSQL | 18 | Optional — `docker compose up -d db` provides it. |

### 1. Install

```bash
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
```

`.env.example` is the **template** for every variable the stack needs. It contains placeholder
values, not real secrets — replace them before doing anything that matters. See
[Security notes](#security-notes).

### 3. Start the database

```bash
docker compose up -d db
```

The database is published on `127.0.0.1:5433` only (the host port; 5432 is often taken by another local Postgres). It is never exposed on the public internet.

### 4. Apply the migrations and seed the reference data

```bash
pnpm db:deploy
pnpm db:seed
```

`db:deploy` applies the migrations with `prisma migrate deploy` (never `migrate dev` against a
shared database). `db:seed` materialises the permission catalogue and the role grants from
`@chlat/contracts` — the catalogue is the single source of truth, and the seed script is the
only thing that writes it to the database. The seed is **idempotent**: running it twice leaves
the database in the same state.

The seed also creates the first super admin, but only when **both** `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` are set in `.env` (at least 12 characters; it is hashed with Argon2id
and never logged). Without them, no account is created and the seed only loads the catalogue.

> The schema in `apps/api/prisma/schema.prisma` is currently the **foundation** schema: the
> `User`, `Permission` and `RolePermission` models only, plus the `20261021185256_init_foundation`
> migration. The full domain schema is the backend developer's first task, and its migrations are
> written alongside it.

### 5. Run the app

```bash
pnpm dev
```

That starts everything through Turborepo:

| Service | URL |
|---|---|
| The web app | http://localhost:3000 |
| The API | http://localhost:3001/api/v1 |
| The API reference (Scalar) | http://localhost:3001/api/v1/docs |
| The database | `postgresql://chlat:chlat@localhost:5433/chlat_park` |

The health probes are public:

```bash
curl http://localhost:3001/api/v1/health/live    # {"success":true,"data":{"status":"ok",…}}
curl http://localhost:3001/api/v1/health/ready   # 503 when the database is unreachable
```

---

## Project layout

```
chlat-park/
├── apps/
│   ├── api/                  # The NestJS 12 API (ESM). Everything the platform does.
│   │   ├── prisma/           # The Prisma schema and the migrations
│   │   ├── src/
│   │   │   ├── common/       # Guards, decorators, interceptors, filters, errors
│   │   │   ├── config/       # The Zod-validated environment
│   │   │   ├── modules/      # The feature modules (health, and later the domain)
│   │   │   └── prisma/       # The Prisma service and its module
│   │   └── test/             # The e2e suite
│   └── web/                  # The Next.js 16 web app (App Router, next-intl)
│       ├── src/app/[locale]/ # The locale-prefixed routes
│       ├── src/lib/          # i18n, the API client, the session helper
│       ├── src/messages/     # en.json and km.json
│       └── src/proxy.ts      # The locale router (Next 16's `middleware.ts`)
│
├── packages/
│   ├── config/               # The shared TypeScript, ESLint and Prettier configuration
│   ├── contracts/            # The Zod schemas, the permission catalogue, the OpenAPI document
│   ├── api-client/           # The typed HTTP client, generated from the OpenAPI document
│   └── ui/                   # The shared React primitives
│
├── specs/                    # The specifications — the source of truth for behaviour
│   ├── README.md             # The SDD loop, the ID namespace, the DoR and the DoD
│   ├── product/              # What the product is, for whom, and what it is not
│   ├── architecture/          # The system, the container, the RBAC model, the deployment
│   ├── features/<feature>/   # spec.md · design.md · tasks.md · acceptance.feature
│   ├── api/openapi.yaml      # GENERATED — do not hand-edit
│   ├── data/                 # The data model and the migration policy
│   ├── security/             # The threat model and the access-control matrix
│   ├── testing/              # The test strategy and the test matrix
│   └── decisions/            # The ADRs — immutable once accepted
│
├── docs/                     # The operational runbooks
│   ├── deployment.md
│   ├── guard-training.md
│   ├── database-backup-restore.md
│   ├── incident-response.md
│   ├── TEAM-WORKFLOW.md      # The two-developer split
│   └── admin-api-contract.md # The contract between the API and the admin console
│
├── AGENTS.md                 # How an AI agent should read and work in this repository
├── docker-compose.yml        # The local development stack
├── pnpm-workspace.yaml       # The workspace, the version catalogue and the supply-chain policy
├── turbo.json                # The task graph
└── tsconfig.base.json        # The shared compiler options
```

---

## Who works on what

There are exactly two developers on this project, and the split is by **authorization surface**,
not by file.

| | **vireaboth** | **kitya** |
|---|---|---|
| **Role** | Frontend engineer | Full-stack engineer |
| **Owns** | The **super admin console** (`/admin/*`) | The **NestJS API** (everything) + every **non-admin** web surface |
| **Builds** | The revenue dashboard, the adoption/users dashboard, the platform site/user/owner management, the platform audit viewer | The guard dashboard, the guest ticket flow, the owner dashboard — and the whole API behind them |
| **Does not touch** | `apps/api/**`, the `(guest)` / `(guard)` / `(owner)` route groups, the Prisma schema, the permission catalogue | `apps/web/src/app/[locale]/(admin)/**` and the admin console's components |

**The contract between them** is [`docs/admin-api-contract.md`](docs/admin-api-contract.md): it
specifies, for every admin endpoint, the method, the path, the required permission, the query
parameters, the request body, the response shape and the error cases. The API side is implemented
by kitya; the console side is built by vireaboth against that document.

**The full working agreement** — the responsibility table, the git branching strategy, the
recommended order of work for each person, and the per-person definition of done — is in
[`docs/TEAM-WORKFLOW.md`](docs/TEAM-WORKFLOW.md). Read it before you start.

Two rules the split depends on:

- **`packages/contracts` is the integration point.** A contract change lands in `main` first;
  both branches then rebase onto it. A branch that changes a contract *and* its consumer in one
  pull request is rejected in review.
- **Domain rules live in the backend.** The console may display the `claimRate` the API computed;
  it may not compute one itself. A hidden button is UX, not authorization — the API decides.

---

## Spec-driven development

This project is developed **spec-first**. The specifications are not documentation written after
the fact; they are the input to the work.

```
Clarify requirement
      ↓
Write / update the feature spec        (specs/features/<feature>/spec.md)
      ↓
Review the acceptance criteria        (spec.md + acceptance.feature)
      ↓
Define the API / data contract         (specs/api/openapi.yaml, specs/data/schema.md)
      ↓
Create the implementation tasks        (specs/features/<feature>/tasks.md)
      ↓
Implement the smallest vertical slice  (one task at a time, requirement IDs in scope)
      ↓
Run the tests and the static checks    (specs/testing/strategy.md)
      ↓
Update the docs and the specs
      ↓
Merge only when the acceptance criteria pass
```

Start at [`specs/README.md`](specs/README.md). It is the entry point for everything below.

### The requirement-ID namespace

Every requirement has a **stable, permanent ID**. IDs are never renumbered and never reused.
The format is `<DOMAIN>-<NNN>`.

| Prefix | Domain | Spec of record |
|---|---|---|
| `AUTH-` | Authentication, sessions, credentials | `features/authentication/` |
| `RBAC-` | Permissions, scopes, grants | `features/authorization/` |
| `PARK-` | Parking sites and their settings | `features/parking-sites/` |
| `SESSION-` | The parking-session lifecycle | `features/parking-session/` |
| `CLAIM-` | Entry QR issuance and the guest claim | `features/entry-qr-claim/` |
| `TICKET-` | E-ticket issuance and display | `features/guest-ticket/` |
| `EXIT-` | Exit verification and completion | `features/exit-verification/` |
| `PRICE-` | Pricing policies, versions, fee calculation | `features/pricing-and-payment/` |
| `PAY-` | Payment states, recording, exemptions | `features/pricing-and-payment/` |
| `OWN-` | Owner and site-manager operations | `features/owner-management/` |
| `ADMIN-` | Platform administration, revenue and adoption analytics | `features/admin-console/` |
| `TG-` | The Telegram channel | `features/telegram-bot/` |
| `AUDIT-` | The audit log | `features/audit/` |
| `SYNC-` | Offline authority and synchronization | `features/offline-sync/` |
| `SEC-` | Cross-cutting security controls | `features/security/` |
| `I18N-` | Khmer / English localisation | `features/internationalization/` |
| `OPS-` | Deployment, health, backup, rollback | `docs/` + `architecture/deployment.md` |

A requirement is one testable behaviour. Requirement text is normative and uses **must** /
**must not** / **may**. An unsettled requirement is recorded as a deferred sub-decision in the
relevant ADR — never as a placeholder in a spec.

### The Definition of Ready

A feature may be **implemented** only when:

- the user outcome is stated in one sentence;
- the in-scope and out-of-scope are written explicitly;
- the normal, failure and abuse cases are described;
- the state transitions are defined (source, trigger, target, guards);
- the API and database impacts are understood;
- the authorization and privacy implications have been reviewed against
  `specs/security/access-control-matrix.md`;
- the acceptance criteria are written in Given/When/Then and are testable;
- the dependencies and migration risks are identified;
- the requirement IDs are assigned;
- the open questions are recorded in an ADR.

### The Definition of Done

A feature may be **merged** only when:

- all acceptance criteria pass;
- the unit and integration tests pass;
- the relevant e2e tests pass (against a real database, not an in-memory fake);
- lint, typecheck and build pass for the affected applications;
- **authorization is tested at the API boundary** — a request with a valid token but the wrong
  scope must be rejected;
- the migrations and their rollback are documented in `specs/data/migrations.md`;
- the logs leak no ticket token, claim token, credential or unnecessary personal data;
- the loading, error, empty and offline states are handled;
- the documentation and the OpenAPI contracts are updated, and the drift check passes;
- the specs and ADRs match the shipped behaviour;
- the code review is approved;
- it is deployed to staging and smoke-tested.

The per-person versions are in [`docs/TEAM-WORKFLOW.md`](docs/TEAM-WORKFLOW.md) §7.

---

## The technology stack

Every version is pinned **exactly** in the pnpm catalog in `pnpm-workspace.yaml` — no `^`, no
`~`, no `latest`. A version bump happens once, in one place. The system has a security-sensitive
authentication surface, and an unexpected major upgrade must never land silently.

| Layer | Technology | Version |
|---|---|---|
| **Runtime** | Node.js | ≥ 22.12 |
| **Package manager** | pnpm | 11.9.0 |
| **Task runner** | Turborepo | 2.11.10 |
| **Language** | TypeScript | 6.0.3 |
| | ESLint | 10.11.0 |
| | typescript-eslint | 8.71.0 |
| | Prettier | 3.9.9 |
| **API** | NestJS (`@nestjs/common`, `core`, `platform-express`) | 12.2.0 |
| | `@nestjs/cli` | 12.0.10 |
| | `@nestjs/config` | 4.0.2 |
| | `@nestjs/jwt` | 11.0.0 |
| | `@nestjs/passport` / `passport-jwt` | 11.0.5 / 4.0.1 |
| | `@nestjs/swagger` | 12.0.2 |
| | `@nestjs/terminus` | 11.0.0 |
| | `@nestjs/throttler` | 6.4.0 |
| | `@scalar/nestjs-api-reference` | 1.2.30 |
| **Data** | Prisma / `@prisma/client` | 7.10.1 |
| | `@prisma/adapter-pg` (the `pg` driver adapter) | 7.10.1 |
| | PostgreSQL | 18 |
| **Validation** | Zod | 4.6.7 |
| | `zod-openapi` | 6.0.2 |
| | `class-validator` / `class-transformer` | 0.15.1 / 0.5.1 |
| **API contract** | OpenAPI | 3.1.0 |
| | `openapi-typescript` | 7.13.0 |
| | `openapi-fetch` | 0.17.0 |
| **Web** | Next.js (App Router, Turbopack) | 16.4.2 |
| | React / React DOM | 19.3.1 |
| | `next-intl` | 4.14.9 |
| | Tailwind CSS / `@tailwindcss/postcss` | 4.3.3 |
| | PostCSS | 8.5.6 |
| **Domain** | `argon2` (Argon2id password hashing) | 0.44.0 |
| | `qrcode` / `html5-qrcode` | 1.5.4 / 2.3.8 |
| **Testing** | Vitest / `@vitest/coverage-v8` | 5.0.5 |
| | `@playwright/test` | 1.64.1 |
| | supertest | 7.1.4 |
| **Tooling** | `yaml` | 2.8.1 |
| | `@types/node` | 22.15.21 |

The catalog also carries a **supply-chain policy**: `minimumReleaseAge: 1440` (24 hours) so a
freshly published — and possibly compromised — release cannot be picked up by a normal install,
and an explicit `allowBuilds` allowlist so only the packages that genuinely need a native build
run their install scripts.

---

## Scripts

All the root scripts run through Turborepo and can be scoped with `--filter`.

### The whole workspace

| Script | What it does |
|---|---|
| `pnpm install` | Install (or re-link) every workspace package. |
| `pnpm dev` | Run every app in watch mode. |
| `pnpm build` | Build every package and app. |
| `pnpm lint` | Lint every package and app. |
| `pnpm lint:fix` | Lint and auto-fix. |
| `pnpm typecheck` | Type-check every package and app. |
| `pnpm test` | Run every test suite. |
| `pnpm test:coverage` | Run the tests with the coverage report. |
| `pnpm format` | Format the repository with Prettier. |
| `pnpm format:check` | Check the formatting without writing (this is what CI runs). |
| `pnpm clean` | Remove the build outputs and `node_modules`. |

### The database

| Script | What it does |
|---|---|
| `pnpm db:generate` | Generate the Prisma client from the schema. |
| `pnpm db:migrate` | Create and apply a development migration (`migrate dev`). |
| `pnpm db:deploy` | Apply the pending migrations (`migrate deploy`) — **use this in production**. |
| `pnpm db:seed` | Seed the permission catalogue and the role grants. |
| `pnpm db:reset` | Drop, re-migrate and re-seed. **Destructive.** |
| `pnpm db:studio` | Open Prisma Studio. |

### The contract

| Script | What it does |
|---|---|
| `pnpm openapi` | Rebuild the contracts and regenerate `specs/api/openapi.yaml`. |
| `pnpm openapi:types` | Regenerate `@chlat/api-client`'s types from the OpenAPI document. |

### Per-package

```bash
pnpm --filter @chlat/contracts build     # the Zod schemas, the permissions, the OpenAPI document
pnpm --filter @chlat/api build           # the NestJS API (proves the ESM .js extensions are right)
pnpm --filter @chlat/web build           # the Next.js app (proves Turbopack, Tailwind v4 and next-intl)
pnpm --filter @chlat/api test:e2e        # the API's e2e suite
pnpm --filter @chlat/api run db:deploy   # the same as pnpm db:deploy
```

---

## Security notes

- **Never commit a secret.** `.env` is gitignored, and the CI's `hygiene` job fails the build if
  it is not.
- **`.env.example` is the template**, not a source of truth for values. It documents every
  variable the stack needs and carries placeholders. The CI job checks that no secret-looking
  variable is committed under a `NEXT_PUBLIC_*` prefix — those are inlined into the client bundle
  at build time and are public by definition.
- **The environment is validated at boot.** `apps/api/src/config/env.ts` parses the environment
  with Zod and the process **refuses to start** when anything is missing or malformed. A
  half-configured API is more dangerous than an API that does not start: a missing `PLATE_PEPPER`
  would silently change the digest of every plate, and a missing `JWT_ACCESS_SECRET` would fall
  back to a value everybody knows. The validation lists every problem at once.
- **The API is deny-by-default.** A route with no `@RequirePermissions(...)` and no `@Public()`
  returns 403. There is no implicit-allow path, and the rule is enforced by a test.
- **The super admin is not a bypass.** It is the `platform` scope plus a full grant set, evaluated
  by the identical check function as every other role. There is no
  `if (isSuperAdmin) return allow` anywhere in the codebase.
- **A plate is personal data.** It belongs to the motorcycle's owner, who may have no relationship
  with the parking lot. The platform counts distinct plates through a keyed digest
  (`plate_digest = HMAC-SHA256(pepper, normalized_plate)`); the digest never leaves the database,
  and no endpoint returns a raw plate list.
- **Passwords are hashed with Argon2id**, and a failed sign-in always answers with the same
  message, whether the address is unknown or the password is wrong.
- **The rate limits are not optional.** The login endpoint has a stricter bucket than the rest of
  the API, per IP and per email.
- **Migrations never run on boot.** They are applied in a controlled release step, before the new
  version serves traffic, so a bad migration can never become a crash loop.
- **The database is published on the loopback interface only** in `docker-compose.yml`, and no
  other port is published at all.

---

## Further reading

| I want to… | Read |
|---|---|
| Understand the product | [`specs/product/product-brief.md`](specs/product/product-brief.md) |
| Know who can do what | [`specs/security/access-control-matrix.md`](specs/security/access-control-matrix.md) |
| Understand the permission system | [`specs/architecture/rbac-design.md`](specs/architecture/rbac-design.md) |
| Find the data model | [`specs/data/schema.md`](specs/data/schema.md) |
| Find the API contract | [`specs/api/openapi.yaml`](specs/api/openapi.yaml) (generated) |
| Know why a decision was made | [`specs/decisions/`](specs/decisions/) |
| Know what is tested | [`specs/testing/test-matrix.md`](specs/testing/test-matrix.md) |
| Work on this repository as an agent | [`AGENTS.md`](AGENTS.md) |
| Know who owns what | [`docs/TEAM-WORKFLOW.md`](docs/TEAM-WORKFLOW.md) |
| Build the admin console | [`docs/admin-api-contract.md`](docs/admin-api-contract.md) |
| Deploy it | [`docs/deployment.md`](docs/deployment.md) |
| Train a guard | [`docs/guard-training.md`](docs/guard-training.md) |
| Handle an incident | [`docs/incident-response.md`](docs/incident-response.md) |
| Back up and restore the database | [`docs/database-backup-restore.md`](docs/database-backup-restore.md) |

---

**License:** UNLICENSED. All rights reserved.
