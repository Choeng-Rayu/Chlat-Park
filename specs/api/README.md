# API Contract

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** ADR-011 (contract-first OpenAPI)

---

## 1. What lives here

| File | Purpose |
|---|---|
| `openapi.yaml` | **GENERATED.** The OpenAPI 3.1 description of the HTTP API. Do not hand-edit. |
| `README.md` | This file — the generation flow and the drift check. |

The OpenAPI document is the **contract of record** for the HTTP API. The web app's typed client is
generated from it, so a contract change and a client change are the same change.

## 2. Generation

The contract is generated from the Zod schemas in `@chlat/contracts`:

```bash
pnpm --filter @chlat/contracts openapi
```

The generator:

1. reads the route definitions and the request/response schemas from `@chlat/contracts`,
2. emits an **OpenAPI 3.1** document,
3. writes it to `specs/api/openapi.yaml`.

The committed file is a **build artefact of the contracts package**, not a hand-maintained
document. Editing it by hand is a mistake: the next generation overwrites it, and the drift check
fails.

## 3. The drift check

CI regenerates the document and compares it with the committed one:

```bash
pnpm --filter @chlat/contracts openapi --check
```

**The build fails when the regenerated document differs from the committed one.** That means:

* a schema change that was not regenerated → the build fails,
* a hand-edit of `openapi.yaml` → the build fails,
* an accidental contract change → the build fails until the file is regenerated and committed.

The same check runs in the `contracts` package's test suite, so `pnpm test` catches it locally
too.

## 4. Why the contract comes first (ADR-011)

The contract-first flow exists because of a specific, observed failure mode: in a project with a
Next.js app, a NestJS API, and a Telegram bot, the business rules drift. The website grows a
special case; the bot grows another; the API grows a third. Each one "works", and no two agree.

The contract is the shared artefact:

```
packages/contracts/
├── src/schemas.ts     # the request/response shapes
├── src/permissions.ts # the permission catalogue
├── src/states.ts      # the state enums
└── src/index.ts
        │
        │  pnpm --filter @chlat/contracts openapi
        ▼
specs/api/openapi.yaml  ──►  packages/api-client (the generated typed client)
        │
        ▼
apps/web (the typed client)   apps/api (the Zod validation at the boundary)
```

The Zod schema is used **twice**: to generate the OpenAPI document, and to validate the incoming
request at the API boundary. The two cannot disagree, because they are the same object.

The Telegram module calls the **domain services** directly, not the HTTP API — so it shares the
same Zod schemas and the same services, and the contract documents the HTTP surface for the web
app.

## 5. Conventions in the contract

| Convention | Rule |
|---|---|
| The base path | `/api/v1` |
| The version | `1.0.0`; a breaking change bumps the path prefix |
| The content type | `application/json` everywhere except the health probes |
| The error envelope | `{ "error": { code, message, details?, requestId } }` — see `features/security/` |
| The success envelope | The resource itself, or `{ "items": [...], "total": n, "page": … }` for a list |
| The identifiers | UUIDs, in `id` |
| The timestamps | ISO-8601 with milliseconds, in UTC (`2026-10-21T09:12:44.120Z`) |
| The money | `amountMinor` (an integer) plus a `currency` string |
| The enums | The shared state enums from `@chlat/contracts` |
| The authentication | A cookie session for the staff routes; the bearer token in the body for the public claim route |
| The idempotency | An `Idempotency-Key` header on the retryable writes |

## 6. The endpoint inventory

The full detail is in the generated document. The shape of the surface:

### Public

| Method | Path | Permission |
|---|---|---|
| POST | `/auth/login` | — |
| POST | `/auth/refresh` | — |
| POST | `/entry-claims/claim` | — (`ticket.claim`) |
| POST | `/telegram/webhook` | — (Telegram secret token) |
| GET | `/health/live` | — |
| GET | `/health/ready` | — |

### Authenticated (staff)

| Method | Path | Permission |
|---|---|---|
| POST | `/auth/logout` | session |
| GET | `/auth/me` | session |
| POST | `/auth/password` | session |
| GET | `/parking-sites` | `site.settings.read` |
| POST | `/parking-sites` | `platform.sites.create` (super admin) |
| GET | `/parking-sites/:siteId` | `site.settings.read` |
| PATCH | `/parking-sites/:siteId` | `site.settings.update` |
| POST | `/parking-sites/:siteId/deactivate` | `platform.sites.deactivate` |
| GET | `/parking-sites/:siteId/sessions` | `site.sessions.read` |
| POST | `/parking-sites/:siteId/sessions` | `site.sessions.create` |
| GET | `/parking-sites/:siteId/sessions/search` | `site.sessions.read` |
| GET | `/parking-sites/:siteId/pricing-policies` | `site.pricing.read` |
| POST | `/parking-sites/:siteId/pricing-policies` | `site.pricing.manage` |
| GET | `/parking-sites/:siteId/staff` | `site.staff.read` |
| POST | `/parking-sites/:siteId/staff/invitations` | `site.staff.invite` |
| DELETE | `/parking-sites/:siteId/staff/:guardId` | `site.staff.deactivate` |
| POST | `/parking-sessions/:sessionId/entry-claim` | `site.entry_qr.reissue` |
| GET | `/parking-sessions/:sessionId` | `site.sessions.read` |
| POST | `/parking-sessions/:sessionId/exit/complete` | `site.exit.complete` |
| POST | `/parking-sessions/:sessionId/payments` | `site.payments.record` |
| POST | `/parking-sessions/:sessionId/manual-review` | `site.review.open` |
| POST | `/parking-sessions/:sessionId/resolve-review` | `site.review.resolve` |
| GET | `/parking-sessions/:sessionId/fee` | `site.sessions.read` |
| POST | `/verification/exit` | `site.ticket.verify` |
| GET | `/tickets/:reference` | `ticket.claim` (public, safe payload) |
| POST | `/tickets/link` | `account.tickets.read` |
| GET | `/account/tickets` | `account.tickets.read` |
| POST | `/account/telegram/link` | `account.telegram.link` |
| GET | `/owner/reports` | `site.reports.read` |
| GET | `/audit` | `site.audit.read` / `platform.audit.read` |
| GET | `/admin/revenue` | `platform.revenue.read` |
| GET | `/admin/adoption` | `platform.analytics.read` |
| GET | `/admin/plate/:digest` | `platform.analytics.read` + `platform.audit.export` |
| GET | `/admin/audit/export` | `platform.audit.export` |
| POST | `/sync/events` | the local authority (machine principal) |

**Every route in this table is enforced by the `PermissionGuard`, and the CI route audit fails if
a route is missing its metadata or is marked `@Public()` without being on the reviewed allowlist.**

## 7. Adding an endpoint

1. Define the request and response schemas in `@chlat/contracts` (Zod).
2. Define the route in the controller with `@RequirePermissions(...)` (or `@Public()` for an
   allowlisted route).
3. Regenerate: `pnpm --filter @chlat/contracts openapi`.
4. Implement the controller and the service.
5. Add the acceptance scenarios to the feature's `acceptance.feature`.
6. Run the drift check and the route audit.

## 8. Deprecation policy

A deprecated endpoint is marked `deprecated: true` in the document, is logged when called, and is
removed only in a major version bump. Removal requires a migration note in the release notes and
a notice period of at least one pilot cycle.
