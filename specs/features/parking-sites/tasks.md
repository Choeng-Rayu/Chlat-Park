# Parking Sites — Tasks

**Status:** In progress
**Requirement IDs:** PARK-001 … PARK-010

---

## Phase A — Data

- [ ] **T-A1 — `parking_sites` model and migration.**
  Satisfies: PARK-003, PARK-004, PARK-005, PARK-010.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `ownerId` required, `status` enum, `settingsJson` with a `{}` default, indexes on
  `ownerId` and `status`.

- [ ] **T-A2 — `ParkingSiteSettings` schema in `@chlat/contracts`.**
  Satisfies: PARK-006, PARK-007, PARK-008.
  Files: `packages/contracts/src/sites.ts`.
  Notes: Zod object with `.strict()`; `entryClaimTtlSeconds` 60..3600 default 300;
  `acceptedPaymentMethods` a non-empty array of the supported methods; `maxActiveSessionsPerPlate`
  1 | 2 (2 = "allow multiple").

- [ ] **T-A3 — Timezone and currency validation.**
  Satisfies: PARK-004, PARK-005.
  Files: `packages/contracts/src/validators.ts`.
  Notes: validate against `Intl.supportedValuesOf('timeZone')` and a supported currency list
  (USD, KHR, THB for the pilot).

## Phase B — API

- [ ] **T-B1 — `ParkingSitesService.create`.**
  Satisfies: PARK-003, PARK-004.
  Files: `apps/api/src/modules/parking-sites/parking-sites.service.ts`, `.spec.ts`.
  Notes: the owner comes from the actor; the body's `ownerId` is stripped.

- [ ] **T-B2 — `ParkingSitesService.update` with the currency immutability rule.**
  Satisfies: PARK-004, PARK-005, PARK-010.
  Files: `apps/api/src/modules/parking-sites/parking-sites.service.ts`, `.spec.ts`.

- [ ] **T-B3 — `ParkingSitesService.deactivate` / `reactivate`.**
  Satisfies: PARK-010.
  Files: `apps/api/src/modules/parking-sites/parking-sites.service.ts`, `.spec.ts`.
  Notes: never cascade-delete; audit the action.

- [ ] **T-B4 — `ParkingSitesController` endpoints.**
  Satisfies: PARK-001, PARK-002, PARK-009.
  Files: `apps/api/src/modules/parking-sites/parking-sites.controller.ts`.
  Notes: `GET /parking-sites` (in-scope, paginated), `POST /parking-sites`,
  `GET /parking-sites/:siteId`, `PATCH /parking-sites/:siteId`,
  `POST /parking-sites/:siteId/deactivate`. Correct `@RequirePermissions` on each.

- [ ] **T-B5 — In-scope site listing.**
  Satisfies: PARK-009.
  Files: `apps/api/src/modules/parking-sites/parking-sites.service.ts`.
  Notes: filter by scope in the query, not in memory; paginate with a stable sort by `name`, `id`.

- [ ] **T-B6 — Site-scoped request guard helper.**
  Satisfies: PARK-001, PARK-002.
  Files: `apps/api/src/modules/authorization/site-context.ts`.
  Notes: reject a site-scoped request with no resolvable target site.

## Phase C — Session interaction

- [ ] **T-C1 — Duplicate-active-session check at session creation.**
  Satisfies: PARK-008.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: `SELECT … FOR UPDATE` on the site's active sessions for that normalized plate; only when
  `maxActiveSessionsPerPlate = 1`; return 409 `PARK_DUPLICATE_ACTIVE_SESSION` with the existing
  session id and entry time.

- [ ] **T-C2 — Deactivated-site check at session creation.**
  Satisfies: PARK-010.
  Files: `apps/api/src/modules/parking-sessions/parking-sessions.service.ts`.
  Notes: 409 `PARK_SITE_DEACTIVATED`.

## Phase D — Web

- [ ] **T-D1 — Site picker in the guard dashboard.**
  Satisfies: PARK-001.
  Files: `apps/web/src/app/(guard)/site-picker/page.tsx`.
  Notes: lists the in-scope sites; the selection is stored in a cookie/session so it survives a
  refresh; the choice is explicit — no implicit default for a multi-site guard.

- [ ] **T-D2 — Site switcher and guard site context.**
  Satisfies: PARK-001.
  Files: `apps/web/src/app/(guard)/layout.tsx`, `apps/web/src/lib/guards/site-context.tsx`.
  Notes: the switcher appears only when the guard has more than one site; switching clears any
  in-progress form.

- [ ] **T-D3 — Owner console site list and settings form.**
  Satisfies: PARK-003, PARK-004, PARK-006, PARK-007, PARK-008.
  Files: `apps/web/src/app/(owner)/owner/sites/`.
  Notes: create, edit, deactivate; the currency field is read-only once a session exists.

## Phase E — Verification

- [ ] **T-E1 — Service unit tests.**
  Satisfies: PARK-003, PARK-004, PARK-005, PARK-010.
  Files: `apps/api/src/modules/parking-sites/parking-sites.service.spec.ts`.

- [ ] **T-E2 — API-boundary authorization tests.**
  Satisfies: PARK-002, PARK-009.
  Files: `apps/api/test/parking-sites.e2e-spec.ts`.
  Notes: a guard for another site, an owner for another owner's site, a super admin for any site.

- [ ] **T-E3 — Duplicate-session and deactivation tests.**
  Satisfies: PARK-008, PARK-010.
  Files: `apps/api/test/parking-sites.e2e-spec.ts`.
  Notes: a plate parked at two different sites is allowed; the same plate twice at one site is
  rejected.
