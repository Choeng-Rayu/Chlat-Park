# Authorization (RBAC) — Tasks

**Status:** In progress
**Requirement IDs:** RBAC-001 … RBAC-016

---

## Phase A — Catalogue and models

- [ ] **T-A1 — Permission catalogue in `@chlat/contracts`.**
  Satisfies: RBAC-001.
  Files: `packages/contracts/src/permissions.ts`, `packages/contracts/src/index.ts`.
  Notes: every key from `specs/architecture/rbac-design.md` §3 with a description and a catalogue
  scope kind; `as const satisfies` so a typo is a compile error; export the `PermissionKey` union.

- [ ] **T-A2 — Prisma models for `permissions`, `role_permissions`, `user_permission_grants`.**
  Satisfies: RBAC-001, RBAC-009, RBAC-014.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.

- [ ] **T-A3 — Seed script.**
  Satisfies: RBAC-009.
  Files: `apps/api/prisma/seed.ts`.
  Notes: insert the catalogue, the role sets from `design.md` §2.1, and a super admin with the full
  grant set. The seed must be idempotent.

- [ ] **T-A4 — `ScopeKind` and `authzVersion` on `users`.**
  Satisfies: RBAC-006, RBAC-011.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.

## Phase B — The check path

- [ ] **T-B1 — `AuthorizationService`.**
  Satisfies: RBAC-002, RBAC-009, RBAC-010, RBAC-014.
  Files: `apps/api/src/modules/authorization/authorization.service.ts`, `.spec.ts`.
  Notes: effective-set computation; the 30 s cache keyed by `${userId}:${authzVersion}`; expired
  grants treated as absent; `REVOKE` beats the role grant; fail closed on a DB error.

- [ ] **T-B2 — `ScopeResolver`.**
  Satisfies: RBAC-005, RBAC-006, RBAC-007, RBAC-016.
  Files: `apps/api/src/modules/authorization/scope-resolver.service.ts`, `.spec.ts`.
  Notes: union of owned + assigned; `platform` matches every site; `self` matches no site; the
  target-site resolution order (route param → loaded session → resource).

- [ ] **T-B3 — `PermissionGuard` (global `APP_GUARD`).**
  Satisfies: RBAC-002, RBAC-003, RBAC-007, RBAC-008.
  Files: `apps/api/src/common/guards/permission.guard.ts`, `.spec.ts`.
  Notes: no metadata → deny; `@Public()` → skip; distinct 403 codes for permission vs scope.

- [ ] **T-B4 — Decorators `@RequirePermissions`, `@Public`.**
  Satisfies: RBAC-002, RBAC-004.
  Files: `packages/contracts/src/decorators.ts`, `apps/api/src/common/decorators/`.

- [ ] **T-B5 — `SiteContext` helper for target-site resolution.**
  Satisfies: RBAC-005.
  Files: `apps/api/src/modules/authorization/site-context.ts`.
  Notes: resolve from `:siteId`; when the route has no `:siteId`, load the resource and use its
  `site_id`; when neither is possible and the permission is site-scoped → deny.

## Phase C — Enforcement and audit

- [ ] **T-C1 — Apply `@RequirePermissions` to every existing route.**
  Satisfies: RBAC-002, RBAC-003.
  Files: all `*.controller.ts` under `apps/api/src/modules/`.
  Notes: work module by module; the route audit will name anything missed.

- [ ] **T-C2 — Route audit test.**
  Satisfies: RBAC-003, RBAC-004.
  Files: `apps/api/test/route-audit.spec.ts`.
  Notes: enumerate the NestJS route table; fail on a missing metadata route; fail on a public
  route that is not on the allowlist; fail on an unknown permission key.

- [ ] **T-C3 — CI guard against role branching.**
  Satisfies: RBAC-008.
  Files: `.github/workflows/ci.yml` (or a `scripts/` check).
  Notes: fail if `isSuperAdmin`, `role === 'super_admin'`, or a similar bypass appears outside
  `apps/api/src/modules/authorization/`.

- [ ] **T-C4 — Audit rows for denials and grant changes.**
  Satisfies: RBAC-013, RBAC-015.
  Files: `apps/api/src/modules/audit/`, `apps/api/src/modules/authorization/`.
  Notes: `authz.permission_denied`, `authz.scope_denied`, `authz.grant_created`,
  `authz.grant_revoked`, `authz.assignment_changed`; the reason is mandatory for exemptions,
  resolutions, and revocations.

- [ ] **T-C5 — `authzVersion` bump on every authorization-affecting write.**
  Satisfies: RBAC-011, RBAC-012.
  Files: `apps/api/src/modules/authorization/`, `apps/api/src/modules/security-guards/`,
  `apps/api/src/modules/owners/`.
  Notes: bump in the same transaction as the grant, revoke, role change, or assignment change.

- [ ] **T-C6 — Grant management endpoints (super admin).**
  Satisfies: RBAC-009, RBAC-014.
  Files: `apps/api/src/modules/authorization/authorization.controller.ts`.
  Notes: list/create/revoke a grant; require `platform.users.read` / `platform.audit.export`
  respectively; a reason is required for a revoke; an optional `expiresAt` is validated to be in
  the future.

## Phase D — Web

- [ ] **T-D1 — Permission-aware UI helpers.**
  Satisfies: RBAC-002.
  Files: `packages/ui/src/permissions.ts`, `apps/web/src/lib/auth/permissions.ts`.
  Notes: `can(permission)` helper reading the actor context from `/auth/me`; used to hide actions —
  never as the enforcement point.

- [ ] **T-D2 — Route guards for the web app.**
  Satisfies: RBAC-002.
  Files: `apps/web/src/middleware.ts`, `apps/web/src/app/(owner)/layout.tsx`,
  `apps/web/src/app/(admin)/layout.tsx`.
  Notes: convenience only; a 403 page is shown for an out-of-scope role.

## Phase E — Verification

- [ ] **T-E1 — Unit tests for the effective-set computation.**
  Satisfies: RBAC-009, RBAC-014.
  Files: `apps/api/src/modules/authorization/authorization.service.spec.ts`.

- [ ] **T-E2 — Scope tests.**
  Satisfies: RBAC-005, RBAC-006, RBAC-007, RBAC-016.
  Files: `apps/api/src/modules/authorization/scope-resolver.service.spec.ts`.

- [ ] **T-E3 — Cross-role API-boundary tests.**
  Satisfies: RBAC-002, RBAC-007, RBAC-008.
  Files: `apps/api/test/authorization.e2e-spec.ts`.
  Notes: a guard on another site, an owner on another owner's site, a registered user on a site
  route, a guest on a staff route, and a super admin without the permission.

- [ ] **T-E4 — Revocation latency test.**
  Satisfies: RBAC-010, RBAC-011.
  Files: `apps/api/test/authorization-revocation.e2e-spec.ts`.
  Notes: unassign a guard and assert the very next request is denied.
