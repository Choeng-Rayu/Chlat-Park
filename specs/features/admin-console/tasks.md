# Admin Console — Tasks

**Status:** In progress
**Requirement IDs:** ADMIN-001 … ADMIN-014

---

## Phase A — Read models

- [ ] **T-A1 — `RevenueService`.**
  Satisfies: ADMIN-001, ADMIN-002, ADMIN-003.
  Files: `apps/api/src/modules/reports/revenue.service.ts`, `.spec.ts`.
  Notes: the four figures from `design.md` §2; the uncollected-at-close query; the currency is
  consistent across the selected sites.

- [ ] **T-A2 — The uncaptured-payment warning.**
  Satisfies: ADMIN-001.
  Files: `apps/api/src/modules/reports/revenue.service.ts`.
  Notes: the query from `design.md` §2.1; the count and the amount are returned alongside the
  figures.

- [ ] **T-A3 — `AdoptionService`.**
  Satisfies: ADMIN-004, ADMIN-005, ADMIN-006, ADMIN-007, ADMIN-008, ADMIN-009.
  Files: `apps/api/src/modules/reports/adoption.service.ts`, `.spec.ts`.
  Notes: the queries from `design.md` §3; no digest is ever placed in a response object.

- [ ] **T-A4 — The bounded time range.**
  Satisfies: ADMIN-014.
  Files: `packages/contracts/src/reports.ts`.
  Notes: `from` and `to` are required; the range is at most 366 days; the range must not be in the
  future.

- [ ] **T-A5 — The audit index migration.**
  Satisfies: ADMIN-013, ADMIN-014.
  Files: `apps/api/prisma/migrations/`.
  Notes: indexes on `createdAt`, `(site_id, created_at)`, `(actor_user_id, created_at)`,
  `(action, created_at)`.

## Phase B — Endpoints

- [ ] **T-B1 — `GET /admin/revenue`.**
  Satisfies: ADMIN-001, ADMIN-002, ADMIN-003.
  Files: `apps/api/src/modules/reports/admin-reports.controller.ts`.
  Notes: `platform.revenue.read`; the `platform` scope.

- [ ] **T-B2 — `GET /admin/adoption`.**
  Satisfies: ADMIN-004 … ADMIN-009.
  Files: `apps/api/src/modules/reports/admin-reports.controller.ts`.
  Notes: `platform.analytics.read`; the payload contains no `plate_digest` key.

- [ ] **T-B3 — `GET /admin/plate/:digest`.**
  Satisfies: ADMIN-011.
  Files: `apps/api/src/modules/reports/admin-reports.controller.ts`.
  Notes: requires `platform.analytics.read` **and** `platform.audit.export`; the rate limit is
  5/min; the response is masked; the request is audited.

- [ ] **T-B4 — `GET /admin/audit` and `POST /admin/audit/export`.**
  Satisfies: ADMIN-013.
  Files: `apps/api/src/modules/audit/audit.controller.ts`.
  Notes: `platform.audit.read` / `platform.audit.export`; the export is bounded at 100 000 rows and
  is rate-limited; the export is audited with the filter and the row count.

- [ ] **T-B5 — Platform management endpoints.**
  Satisfies: ADMIN-012.
  Files: `apps/api/src/modules/owners/owners.controller.ts`,
  `apps/api/src/modules/parking-sites/parking-sites.controller.ts`,
  `apps/api/src/modules/users/users.controller.ts`.
  Notes: create an owner, create a site for an owner, suspend an owner or a user, deactivate a
  site; every action audited.

## Phase C — Web

- [ ] **T-C1 — The admin shell and navigation.**
  Satisfies: ADMIN-001.
  Files: `apps/web/src/app/(admin)/admin/layout.tsx`.
  Notes: the platform scope is checked; a non-super-admin sees a 403 page.

- [ ] **T-C2 — The revenue panel.**
  Satisfies: ADMIN-001, ADMIN-002, ADMIN-003.
  Files: `apps/web/src/app/(admin)/admin/revenue/page.tsx`.
  Notes: the four figures in separate cards with explicit labels; the exempt card is marked as
  leakage; the uncaptured warning is a banner; the period and site pickers.

- [ ] **T-C3 — The adoption panel.**
  Satisfies: ADMIN-005, ADMIN-006, ADMIN-007, ADMIN-008, ADMIN-009.
  Files: `apps/web/src/app/(admin)/admin/adoption/page.tsx`.
  Notes: the registered-vs-guest split, the funnel with the claim rate highlighted, the repeat
  rate, the per-site table, and the monthly trend chart.

- [ ] **T-C4 — The audit viewer and export.**
  Satisfies: ADMIN-013.
  Files: `apps/web/src/app/(admin)/admin/audit/page.tsx`.
  Notes: filters, a paginated table, and an export button that states the row limit.

- [ ] **T-C5 — Platform management screens.**
  Satisfies: ADMIN-012.
  Files: `apps/web/src/app/(admin)/admin/owners/`, `admin/sites/`.
  Notes: create an owner; create a site; suspend; deactivate; each with a confirmation and a reason
  where required.

## Phase D — Verification

- [ ] **T-D1 — Revenue tests.**
  Satisfies: ADMIN-001, ADMIN-002, ADMIN-003.
  Files: `apps/api/test/admin-revenue.e2e-spec.ts`.
  Notes: mixed payment statuses; the exemption is excluded from the collected figure; the
  uncollected figure; the uncaptured warning.

- [ ] **T-D2 — Adoption tests.**
  Satisfies: ADMIN-004 … ADMIN-009.
  Files: `apps/api/test/admin-adoption.e2e-spec.ts`.
  Notes: known fixtures with hand-computed expected values; assert no `plateDigest` key in any
  response.

- [ ] **T-D3 — Authorization tests.**
  Satisfies: ADMIN-011, ADMIN-012.
  Files: `apps/api/test/admin.e2e-spec.ts`.
  Notes: an owner reaching an admin endpoint; a super admin without `platform.audit.export` using
  the per-plate view.

- [ ] **T-D4 — Range and export bounds.**
  Satisfies: ADMIN-013, ADMIN-014.
  Files: `apps/api/test/admin.e2e-spec.ts`.
  Notes: a 400 for an over-long range; a 400 for an over-large export.
