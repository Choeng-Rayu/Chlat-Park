# ADR-001: Monorepo Layout — `apps/web` and `apps/api` Only

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** — (governs the repository structure)

---

## Context

Chlat-Park has two distinct applications (a Next.js web/PWA and a NestJS API), a shared
contracts package, and a Telegram integration. The plan's §12 proposed four applications
(`web`, `guard-dashboard`, `api`, `telegram-bot`) and four packages. In practice, several of those
boundaries are expensive and one of them is a data-integrity risk.

Three specific concerns drove the decision:

1. **The guard dashboard and the owner experience share most of their non-visual code** — the
   session-reading, the ticket display, the API client, the UI primitives. Splitting them into two
   Next.js applications duplicates that code and creates a second deployment to keep in sync.
2. **A separate Telegram bot service is a second ticket database waiting to happen.** The moment
   the bot holds any state of its own, the business rules start to drift.
3. **The plan's `guards` module name collides with `src/common/guards/`** in a NestJS application,
   where `guards` conventionally holds the framework guards (`PermissionGuard`, `JwtAuthGuard`).

The data layer also needs to be chosen: Prisma with PostgreSQL, or a hand-rolled repository layer.

## Decision

1. **The repository contains exactly two applications:**
   * `apps/web` — a single Next.js application. The owner experience, the guest ticket flow, and
     the guard dashboard are **route groups** within it:
     ```
     apps/web/src/app/
     ├── (owner)/          # /ticket/…, /account
     ├── (guard)/          # /guard/login, /guard/site/[siteId]/…
     ├── (admin)/          # /admin/…
     └── (auth)/           # /login
     ```
   * `apps/api` — a single NestJS application.

2. **The Telegram bot is a module inside `apps/api`** (`TelegramModule`), not a separate service.
   It calls the same domain services as the web app.

3. **The security-guard feature module is named `security-guards`** and the Prisma model is
   `SecurityGuard`. It must never be named `guards`, and it must never share an import path or a
   route prefix with `apps/api/src/common/guards/`.

4. **The data layer is Prisma 7** with PostgreSQL 16. The schema at
   `apps/api/prisma/schema.prisma` is the executable source of truth; `specs/data/schema.md` is
   its narrative.

5. **The shared packages are:**
   ```
   packages/
   ├── contracts/     # the Zod schemas, the permission catalogue, the OpenAPI generator
   ├── api-client/    # the typed HTTP client generated from the OpenAPI document
   ├── config/        # the shared TypeScript, ESLint, and Prettier configuration
   └── ui/            # the shared React components
   ```

6. **The repository is a pnpm workspace** (`pnpm-workspace.yaml` + `pnpm-lock.yaml`).

## Update — the `ui` package was removed (2026-10-21)

**Status:** Accepted, partially reversed — decision 5's `packages/ui` entry no longer holds.

The decision above stands as written: it records what was agreed at the time. The `ui` entry of
decision 5 was **reversed on 2026-10-21**, and `packages/ui` no longer exists. The reasoning:

* **It had no consumers.** Nothing imported `@chlat/ui`, so the package was a build step, a
  dependency edge and a Tailwind `@source` registration for no benefit.
* **It contradicted the app's actual design system.** The design system of record is the token
  scale and the component classes in `apps/web/src/styles/globals.css` (`ink-*`, `accent-*`, `.btn`,
  `.btn-primary`, `.btn-secondary`, `.surface`, `.link`). The package's primitives used Tailwind's
  *default* palette (`neutral-*`, `sky-*`, `emerald-*`, `amber-*`, `red-*`) instead, so they could
  never have matched the app.
* **Its stylesheet was never imported.** `packages/ui/src/styles.css` registers `@source "./"` with
  Tailwind's scanner, but no application file imported it — so the primitives would have rendered
  unstyled.

**What replaces it:** there is exactly one web application, so there is exactly one components
folder. Every shared React component lives in `apps/web/src/components/`, and the design system of
record is `apps/web/src/styles/globals.css`. The remaining shared packages (`contracts`,
`api-client`, `config`) are unchanged.

## Consequences

### Positive

* **One deployment for the whole front end.** The owner, the guest, the guard, and the admin are
  one application with one build, one bundle strategy, and one set of CI checks.
* **No business-rule duplication.** The Telegram module and the web app both call the NestJS
  domain services. A rule cannot be implemented twice, so it cannot drift.
* **A smaller surface to secure.** Two applications instead of four means two cookie origins, two
  TLS configurations, two sets of environment variables, and two attack surfaces.
* **The contracts package is the single source of truth** for the request/response shapes, the
  permission catalogue, and the state enums. The API validates with the same schema that generates
  the OpenAPI document.
* **The `SecurityGuard` naming removes a real collision** in the NestJS ecosystem.

### Negative

* **The guard bundle and the owner bundle live in one application.** If the guard dashboard needs a
  heavy dependency, it weighs on the owner page's bundle. Mitigated by route-group code splitting
  and by keeping the dependency surface small.
* **A Next.js build failure blocks every front-end surface**, not just one. Accepted: the surfaces
  share a release cadence at pilot scale.
* **Prisma is a dependency with opinions.** The generated client, the migration workflow, and the
  relation semantics are its own learning curve, and the `row_version` optimistic-lock pattern has
  to be maintained by hand. Accepted for the type safety, the migration tooling, and the
  relationship modelling.
* **A single API process carries the Telegram workload.** A slow or failing Telegram call must
  never block the HTTP path; the outbound calls are isolated and time-boxed.

### Neutral

* The plan's `apps/guard-dashboard/` and `apps/telegram-bot/` do not exist. Any future requirement
  for a genuinely separate application (a native mobile app, for example) would need a new ADR.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Four applications (`web`, `guard-dashboard`, `api`, `telegram-bot`) | The duplication between the two Next.js applications, and the drift risk of a separate bot service. The guard dashboard is a route group. |
| A separate `apps/worker` for the Telegram bot | It would need the database and the domain services anyway, and it would add a second deployment for a P1 feature. The module is enough. |
| A monorepo tool other than pnpm | pnpm's workspace model and its strict, non-hoisted `node_modules` make the dependency boundaries explicit, which matters when the contracts package must be the only shared source. |
| TypeORM or a hand-rolled repository layer | TypeORM's runtime metadata and its relation handling are harder to review; a hand-rolled layer means writing the queries, the transactions, and the migrations by hand. Prisma gives a reviewed schema and a real migration system. |
| Drizzle instead of Prisma | Drizzle is lighter and closer to SQL, but Prisma's schema-as-source-of-truth and its migration tooling are a better fit for a spec-driven workflow where the schema is a documented artefact. |
| Naming the module `guards` | It collides with `src/common/guards/`. `security-guards` removes the ambiguity permanently. |

## Related

* `specs/architecture/container-architecture.md` — the module layout this decision produces.
* `specs/data/schema.md` — the Prisma schema of record.
* `specs/api/README.md` — the contracts package and the generation flow.
* `specs/product/product-brief.md` §7 — the locked decisions.
