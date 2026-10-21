# ADR-006: Permission-Based RBAC with a Scope Model

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** RBAC-001 … RBAC-016

---

## Context

Chlat-Park has five actor kinds with overlapping capabilities, and the same capability means
different things at different parking sites. A guard may exit a motorcycle at their site and
nowhere else. An owner may read the reports for their sites and nowhere else. A super admin sees
everything, but must be audited, and must not be a special case in the code.

The usual implementations each fail in a characteristic way:

| Approach | Failure mode |
|---|---|
| Role checks in the controllers (`if (role === 'owner')`) | Not composable, not testable at the boundary, and trivially bypassed by a forgotten check. |
| A single `isAdmin` boolean | The same, plus it makes the *scope* invisible — and the scope is the containment boundary. |
| Postgres row-level security | Powerful, but it interacts badly with a pooled connection and an ORM, and it makes the rules invisible to a code reviewer. |
| Checking only in the service layer | The service layer is where the domain invariants live; mixing authorization in makes them harder to test and to reason about. |

The specific thing that has to be right: **super admin must not be a bypass.** A bypass is a
permanent vulnerability that is invisible in a code review, because `if (isSuperAdmin) return allow`
looks like a harmless shortcut.

## Decision

1. **Authorization is two orthogonal axes.**
   * **Permission** — *what*: a dot-notation key (`site.exit.complete`) from a single catalogue in
     `packages/contracts/src/permissions.ts`.
   * **Scope** — *where*: the set of sites the actor may act on, derived from their data.

   Both are required for an allow.

2. **The scope kinds are:** `platform` (all sites — the super admin), `owned` (the sites whose
   `owner_id` is the actor's owner profile), `assigned` (the sites in the actor's guard site
   assignments), and `self` (no site scope — a registered owner). A user may hold several; the
   resolved scope is the **union**.

3. **The enforcement path is one function.**
   * `PermissionGuard` — a **global** `APP_GUARD` — reads `@RequirePermissions(...)` metadata.
   * `AuthorizationService` — the fine-grained, DB-backed check.
   * `ScopeResolver` — resolves the target site (from the `:siteId` route param, from the loaded
     session, or from the resource) and tests it against the actor's scope set.

   Every role passes through the same function. There is no per-role branch.

4. **Super admin is a wider scope plus a full grant set**, evaluated by the identical check path.
   **There is no `if (isSuperAdmin) return allow` branch anywhere.** A CI check greps for the bypass
   patterns outside the authorization module.

5. **Deny by default.** A route with neither `@RequirePermissions(...)` nor `@Public()` returns
   403. There is no implicit-allow path. The `PermissionGuard` treats "no metadata" as "deny".

6. **The `@Public()` allowlist is explicit and reviewed.** A CI route-audit test enumerates the
   NestJS route table and fails the build when a route lacks its metadata, or when a public route
   is not on the reviewed list.

7. **Two layers of authorization.**
   * **Coarse:** `users.role` (`super_admin | owner | guard | user`) in the JWT. Used for routing
     and coarse checks. It only ever *narrows* what is possible; it never grants by itself.
   * **Fine:** the DB-backed `permissions` + `role_permissions` + `user_permission_grants`, checked
     on **every** request. This is the authoritative decision.

8. **Revocation is immediate.** Any change to a user's permissions, role, or site assignments
   increments `users.authzVersion` in the same transaction as the change. The in-process cache is
   keyed by `(userId, authzVersion)` and has a 30-second hard TTL, so a bump invalidates every
   cached entry for that user immediately.

9. **The effective permission set is** `role_permissions[role] ∪ GRANT overrides − REVOKE
   overrides`. A per-user `REVOKE` always beats the role grant. An expired grant is absent.

10. **A per-user grant changes *what*, never *where*.** A grant never widens the scope. The scope
    is derived only from the owner's sites and the guard's assignments.

11. **Both denials are audited**: `AUTHZ_PERMISSION_DENIED` and `AUTHZ_SCOPE_DENIED`, with the
    actor, the route, the required permission, the target site, and the request id.

## Consequences

### Positive

* **One check function serves every role.** The behaviour of a guard, an owner, a registered
  owner, a guest, and a super admin is decided in the same place, so it is reviewed in the same
  place and tested in the same way.
* **The scope is a containment boundary, not a hint.** A cross-site access attempt fails at the
  scope check regardless of what permissions the actor holds.
* **Revocation is immediate.** Deactivating a guard's assignment takes effect on their next
  request, not when their token expires.
* **The deny-by-default rule is enforced by CI**, not by a code-review convention. A new route
  without a permission fails the build.
* **The permission catalogue is a typed constant.** A typo in a permission key is a compile error,
  and the catalogue is the same artefact for the API, the web app, the seed script, and the route
  audit.
* **The audit trail can answer "who did what"** for every denial, not just the successes.

### Negative

* **A database round trip per request.** Mitigated by the 30-second / `authzVersion` cache.
  Correctness beats a saved millisecond.
* **Two permission sources can disagree.** The precedence is defined and unit-tested, but it is one
  more thing to understand.
* **The role is partly redundant.** The coarse `users.role` and the fine grants overlap. The coarse
  role exists for routing and for the UI; the fine grants are the truth. This is a real duplication.
* **A grant cannot widen the scope.** Sometimes an operator wants "let this guard work at that
  other site for a day". The answer is an assignment, not a grant.
* **The `ScopeResolver` must know where the target site comes from** for every route shape. A
  route whose site cannot be resolved must deny rather than assume.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | Should an owner be able to grant `site.payments.exempt` to a specific guard? | The permission is currently role-granted. A per-guard, per-site grant would be the natural extension. | Before Phase 5 |
| D2 | Is there a maximum number of sites per owner? | A pilot-scale limit may be needed. | Phase 5 |
| D3 | Should platform scope ever be delegable? | The current answer: no, not in the pilot. | Deferred |
| D4 | Should the 30-second cache TTL be configurable? | The `authzVersion` mechanism makes the TTL a backstop rather than the primary control. | Deferred |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Role checks in the controllers | Not composable, not testable at the boundary, and bypassed by a forgotten check. |
| A single `isAdmin` boolean | Hides the scope, which is the containment boundary. |
| Postgres row-level security | Interacts badly with a pooled connection and an ORM; the rules become invisible to a code reviewer. It may be worth revisiting at a much larger scale. |
| Checking only in the service layer | Mixes authorization with the domain invariants and makes both harder to test. |
| A super-admin bypass branch | A permanent vulnerability that is invisible in a code review. The platform scope achieves the same outcome and stays auditable. |
| A JWT-only permission list | Revocation would not take effect until the token expired. |
| Checking only the fine-grained layer | It is the authoritative layer; the coarse role is a cheap optimisation on top of it, not a replacement. |
| Allowing a grant to widen the scope | That is the scope's job. A grant that widened the scope would be a back door into the containment boundary. |

## Related

* `specs/architecture/rbac-design.md` — the full design of record, including the request-flow trace.
* `specs/security/access-control-matrix.md` — the role × permission × scope table.
* `specs/features/authorization/` — the requirements and the acceptance criteria.
* `specs/data/schema.md` — the RBAC models.
* `specs/security/threat-model.md` §4.6 — the elevation-of-privilege analysis.
