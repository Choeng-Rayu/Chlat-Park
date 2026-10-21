# Authorization (RBAC)

**Status:** In progress
**Requirement IDs:** RBAC-001 … RBAC-016
**Depends on:** `authentication` (the actor context), `parking-sites` (site scope)

---

## 1. Problem

Chlat-Park has five kinds of actor — platform administrator, parking owner, security guard,
registered owner, guest — with overlapping but different capabilities, and the same capability
means different things at different parking sites. A guard may exit a motorcycle at *their* site
and nowhere else. An owner may read reports for *their* sites and nowhere else. A super admin sees
everything, but must still be **audited** when acting, and must not be a special case in the code.

The failure mode we are designing against is the familiar one: a role check in a controller that
somebody later copies, an `if (isAdmin)` shortcut, and a data leak that nobody notices until a
parking lot complains.

## 2. Scope

### 2.1 In scope

* The permission catalogue and its source of truth in `@chlat/contracts`.
* The scope model: `platform`, `owned`, `assigned`, `self`.
* The enforcement path: `PermissionGuard` (global) + `ScopeResolver` + `AuthorizationService`.
* Deny-by-default, and the CI route audit that enforces it.
* Two-layer authorization: coarse `users.role` in the JWT, fine DB-backed grants per request.
* Per-user grant overrides (`GRANT` / `REVOKE`) with optional expiry.
* Immediate revocation via `users.authzVersion`.
* Audit rows for permission and scope denials and for grant changes.
* The `@Public()` allowlist.

### 2.2 Out of scope

* Field-level or row-level redaction beyond what the DTO layer already omits.
* Approval workflows for high-value actions (an owner approving a guard's exemption).
* Delegated administration (a super admin delegating platform scope to another account) — deferred.
* Per-tenant data residency.

## 3. Actors

| Actor | Typical request |
|---|---|
| Security guard | `POST /parking-sessions` at their assigned site; `POST /verification/exit` |
| Parking owner | `GET /parking-sites/:siteId/reports` for a site they own |
| Platform administrator | `GET /admin/revenue`; `POST /admin/sites` |
| Registered owner | `GET /account/tickets` |
| Guest | `POST /entry-claims/claim` |

## 4. Behaviour

1. A request arrives. The `JwtAuthGuard` authenticates the actor and attaches an `ActorContext`.
2. The global `PermissionGuard` reads the route's `@RequirePermissions(...)` metadata.
3. If the route is not marked `@Public()`, the guard asks the `AuthorizationService` whether the
   actor holds the required permission(s) — the fine-grained, DB-backed check.
4. The `ScopeResolver` determines the target site (from the `:siteId` route parameter, from the
   loaded session, or from the resource) and tests it against the actor's resolved scope set.
5. Both the permission check and the scope check must pass. A failure is a 403 with a distinct
   error code (`AUTHZ_PERMISSION_DENIED` vs `AUTHZ_SCOPE_DENIED`).
6. A super admin passes the same path: the platform scope makes every site in scope, and the
   permission set is a full grant set. There is no shortcut.
7. A route with neither `@RequirePermissions` nor `@Public()` is denied, and the CI route audit
   fails the build.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| RBAC-001 | The system must define every capability as a dot-notation permission key registered in a single catalogue, and must reject any request whose route references a permission key that is not in the catalogue. | P0 |
| RBAC-002 | Every request that is not explicitly marked `@Public()` must be checked against the permission catalogue, and the check must be performed by the backend on every request regardless of what the client displays. | P0 |
| RBAC-003 | A route that declares neither `@RequirePermissions(...)` nor `@Public()` must return HTTP 403, and a CI test must fail the build when such a route exists. | P0 |
| RBAC-004 | A route may be marked `@Public()` only if it appears on the reviewed allowlist in the threat model; the CI route audit must fail when a route is marked public without being on that list. | P0 |
| RBAC-005 | The system must resolve the target site for a site-scoped request from the `:siteId` route parameter, or from the `siteId` of the loaded session or resource, and must reject the request when no target site can be determined. | P0 |
| RBAC-006 | An actor's site scope must be computed as the union of: all sites, for `platform` scope; sites whose `owner_id` equals the actor's owner profile, for `owned` scope; sites listed in the actor's guard site assignments, for `assigned` scope; and no sites, for `self` scope. | P0 |
| RBAC-007 | A site-scoped request must be rejected with HTTP 403 and the code `AUTHZ_SCOPE_DENIED` when the target site is not in the actor's resolved scope. | P0 |
| RBAC-008 | A super admin must be authorized through the identical check path as every other role; the codebase must contain no branch that grants access based solely on the super-admin role or on `scopeKind = 'platform'` without also verifying the required permission. | P0 |
| RBAC-009 | The effective permission set of an actor must be the union of the role's `role_permissions` and the actor's non-expired `GRANT` overrides, minus the actor's `REVOKE` overrides; a `REVOKE` must always take precedence over a role grant. | P0 |
| RBAC-010 | The fine-grained permission check must be executed against the database on every request, and the result may be cached in-process for at most 30 seconds, keyed by the actor's `authzVersion`. | P0 |
| RBAC-011 | Any change to a user's permissions, role, or site assignments must increment that user's `authzVersion` in the same transaction as the change, so that the change takes effect on the actor's next request without waiting for a cache expiry. | P0 |
| RBAC-012 | When a user is suspended, the system must reject their requests immediately and must revoke all outstanding refresh tokens for that user. | P0 |
| RBAC-013 | A permission denial and a scope denial must each be recorded in the audit log with the actor, the route, the required permission, the target site, and the request id. | P0 |
| RBAC-014 | A per-user permission grant may specify an expiry; an expired grant must be treated as absent for the purposes of RBAC-009. | P0 |
| RBAC-015 | The `site.payments.exempt` and `site.review.resolve` permissions must require a non-empty reason when exercised, and the reason must be stored with the resulting audit row. | P0 |
| RBAC-016 | A request that requires a site scope but targets a site that the actor may not access must not leak whether the site exists; the response must be identical to the response for a site that does not exist. | P0 |

## 6. Acceptance criteria

### Normal

* **RBAC-001, RBAC-002** — Given a guard assigned to site "S1", when the guard calls
  `POST /parking-sites/S1/sessions`, then the request is allowed and the session is created.
* **RBAC-006, RBAC-009** — Given a guard with the role grant `site.sessions.create` and a per-user
  `GRANT` for `site.pricing.manage`, when the effective permission set is computed, then it
  contains both permissions.
* **RBAC-011** — Given a guard assigned to site "S1", when the guard is unassigned from "S1", then
  the guard's next request for site "S1" is rejected with `AUTHZ_SCOPE_DENIED` without waiting for
  a cache expiry.
* **RBAC-010** — Given a permission check has been performed for a user, when the same check is
  repeated within 30 seconds, then the database is not queried again.

### Failure

* **RBAC-003** — Given a controller route with no permission metadata, when the route audit test
  runs, then the build fails and the failing route path is reported.
* **RBAC-005** — Given a request to `POST /parking-sessions/:sessionId/exit/complete` for a session
  whose `site_id` is "S2", when a guard assigned only to "S1" calls it, then the response is 403
  with `AUTHZ_SCOPE_DENIED`.
* **RBAC-007** — Given an owner who owns site "S1", when the owner calls
  `GET /parking-sites/S2/reports`, then the response is 403 with `AUTHZ_SCOPE_DENIED`.
* **RBAC-009** — Given a role grant for `site.exit.complete` and a per-user `REVOKE` for the same
  permission, when the effective permission set is computed, then `site.exit.complete` is absent.
* **RBAC-014** — Given a per-user `GRANT` whose `expiresAt` is in the past, when the effective
  permission set is computed, then the grant is absent.

### Abuse

* **RBAC-008** — Given a super admin, when they call `GET /parking-sites/S1/reports` without the
  `site.reports.read` permission granted to the `super_admin` role, then the request is rejected
  with `AUTHZ_PERMISSION_DENIED`; the super-admin scope does not grant the permission.
* **RBAC-016** — Given site "S9" exists and site "S8" does not, when an actor with no scope for
  either requests a report for "S8" and then for "S9", then both responses have the same status and
  the same body.
* **RBAC-013** — Given a denied request, when the audit log is queried, then a row exists with the
  actor, the route, the required permission, and the target site.
* **RBAC-015** — Given a guard with `site.payments.exempt`, when the guard exempts a fee without a
  reason, then the request is rejected with 400 `VALIDATION_FAILED` and no exemption is recorded.
* **RBAC-003** — Given a route marked `@Public()` that is not on the reviewed allowlist, when the
  route audit test runs, then the build fails.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Should a parking owner be able to grant `site.payments.exempt` to a specific guard? | Product owner | Before Phase 5 |
| Q2 | What is the maximum number of sites one owner may hold in the pilot? | Product owner | Phase 5 |
| Q3 | Should delegation of platform scope ever be permitted? | Product owner | Deferred — out of scope for the pilot |

## 8. Related

* `specs/architecture/rbac-design.md` — the full design of record.
* `specs/security/access-control-matrix.md` — the role × permission × scope table.
* `specs/features/admin-console/` — platform-level permissions.
* `specs/data/schema.md` — the RBAC models.
