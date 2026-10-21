# Owner Management — Tasks

**Status:** In progress
**Requirement IDs:** OWN-001 … OWN-012

---

## Phase A — Data

- [ ] **T-A1 — `parking_owners` and `security_guards` models.**
  Satisfies: OWN-001, OWN-003.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: the model is named `SecurityGuard` (not `guards`) — see L1.

- [ ] **T-A2 — `guard_site_assignments` with `role` and `status`.**
  Satisfies: OWN-004, OWN-005.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: `@@unique([guardId, siteId])`; `SiteRole { guard, manager }`; `AssignmentStatus`.

- [ ] **T-A3 — The manager site role → per-user grants.**
  Satisfies: OWN-004, OWN-012.
  Files: `apps/api/src/modules/authorization/authorization.service.ts`,
  `apps/api/src/modules/security-guards/security-guards.service.ts`.
  Notes: creating a `manager` assignment grants the manager permission set with an explicit site
  list; deactivating revokes it; both bump `authzVersion`.

## Phase B — Owner console API

- [ ] **T-B1 — Owner site management endpoints.**
  Satisfies: OWN-002.
  Files: `apps/api/src/modules/parking-sites/parking-sites.controller.ts`.
  Notes: the owner-facing routes are the same services with the `owned` scope; the owner id comes
  from the actor.

- [ ] **T-B2 — `POST /parking-sites/:siteId/staff/invitations`.**
  Satisfies: OWN-003, OWN-004.
  Files: `apps/api/src/modules/security-guards/security-guards.controller.ts`,
  `security-guards.service.ts`.
  Notes: create the pending user, the guard profile, and the assignment in one transaction; the
  response contains no password and no set-password token.

- [ ] **T-B3 — `DELETE /parking-sites/:siteId/staff/:guardId`.**
  Satisfies: OWN-005.
  Files: `apps/api/src/modules/security-guards/security-guards.controller.ts`.
  Notes: deactivate the assignment; revoke the manager grants; bump `authzVersion`; audit.

- [ ] **T-B4 — `GET /parking-sites/:siteId/staff`.**
  Satisfies: OWN-004.
  Files: `apps/api/src/modules/security-guards/security-guards.controller.ts`.
  Notes: the assignments with their site roles; the scope check applies.

- [ ] **T-B5 — Owner pricing endpoints.**
  Satisfies: OWN-006.
  Files: `apps/api/src/modules/pricing/pricing.controller.ts`.
  Notes: reading the versions; creating a new one; no update path.

- [ ] **T-B6 — Owner suspension by the platform.**
  Satisfies: OWN-010.
  Files: `apps/api/src/modules/owners/owners.controller.ts`, `owners.service.ts`.
  Notes: `platform.owners.suspend`; the owner's status changes; their data is retained; their
  refresh tokens are revoked; their access is blocked immediately.

## Phase C — Reports

- [ ] **T-C1 — The owner report query.**
  Satisfies: OWN-007, OWN-008.
  Files: `apps/api/src/modules/reports/reports.service.ts`.
  Notes: the filters are site, from, to, and status; the scope is enforced in the query
  (`site_id = ANY(inScope)`), not in memory.

- [ ] **T-C2 — Collected / exempt / voided / uncollected.**
  Satisfies: OWN-008.
  Files: `apps/api/src/modules/reports/reports.service.ts`.
  Notes: the SQL from `specs/architecture/rbac-design.md` §9.1 and the uncollected query from
  `design.md` §4.2; all amounts in minor units; the currency must be consistent across the
  selected sites.

- [ ] **T-C3 — The report DTO omits the plate.**
  Satisfies: OWN-011.
  Files: `packages/contracts/src/reports.ts`.
  Notes: a strict schema with no plate field; a test asserts the key set.

- [ ] **T-C4 — `GET /owner/reports`.**
  Satisfies: OWN-007.
  Files: `apps/api/src/modules/reports/reports.controller.ts`.
  Notes: `site.reports.read`.

- [ ] **T-C5 — Owner audit read.**
  Satisfies: OWN-009.
  Files: `apps/api/src/modules/audit/audit.controller.ts`.
  Notes: `site.audit.read`; scope-bounded; read-only; no delete route.

## Phase D — Web

- [ ] **T-D1 — The owner dashboard.**
  Satisfies: OWN-001, OWN-002.
  Files: `apps/web/src/app/(owner)/owner/page.tsx`.
  Notes: the sites, a summary of today's activity, and the outstanding exceptions.

- [ ] **T-D2 — The staff management screen.**
  Satisfies: OWN-003, OWN-004, OWN-005.
  Files: `apps/web/src/app/(owner)/owner/sites/[siteId]/staff/page.tsx`.
  Notes: invite, list, deactivate; the site role selector; a confirmation for deactivation.

- [ ] **T-D3 — The pricing screen.**
  Satisfies: OWN-006.
  Files: `apps/web/src/app/(owner)/owner/sites/[siteId]/pricing/page.tsx`.
  Notes: the version history; the editor creates a new version; a preview calculator.

- [ ] **T-D4 — The reports screen.**
  Satisfies: OWN-007, OWN-008, OWN-011.
  Files: `apps/web/src/app/(owner)/owner/reports/page.tsx`.
  Notes: the filters; the four money figures shown separately with their labels; a per-site table;
  no plate column.

## Phase E — Verification

- [ ] **T-E1 — Scope tests.**
  Satisfies: OWN-002.
  Files: `apps/api/test/owner.e2e-spec.ts`.
  Notes: an owner reading another owner's site, report, and audit log.

- [ ] **T-E2 — Invitation tests.**
  Satisfies: OWN-003, OWN-004.
  Files: `apps/api/test/owner.e2e-spec.ts`.
  Notes: the created user, the guard profile, the assignment, the pending status, the absence of a
  password, and the rejection of a password in the body.

- [ ] **T-E3 — Revocation latency test.**
  Satisfies: OWN-005.
  Files: `apps/api/test/owner.e2e-spec.ts`.
  Notes: deactivate and assert the next request is denied.

- [ ] **T-E4 — Report shape test.**
  Satisfies: OWN-008, OWN-011.
  Files: `apps/api/test/reports.e2e-spec.ts`.
  Notes: the four figures; no plate key in the payload.
