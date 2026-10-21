# Chlat-Park — Access Control Matrix

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`../architecture/rbac-design.md`](../architecture/rbac-design.md) · [`threat-model.md`](./threat-model.md) · ADR-006

---

## 1. How to read this document

Three independent axes decide whether a request is allowed:

1. **Permission** — *what* the actor may do. A dot-notation key from the catalogue.
2. **Scope** — *where* the actor may do it: `platform` (all sites), `owned` (the sites the actor
   owns), `assigned` (the sites the actor is assigned to), or `self` (own resources only).
3. **Channel** — how the actor is authenticated: a staff session, a registered owner session, a
   Telegram identity, or a public bearer token.

**All three must permit the action.** A permission without a scope is meaningless, and a scope
without a permission is meaningless.

**Super admin is not a bypass.** It is the `platform` scope plus a full grant set, evaluated by
the identical check function. There is no `if (isSuperAdmin) return allow` anywhere.

## 2. The roles and their scopes

| Role (`users.role`) | `scopeKind` | Site scope | Who they are |
|---|---|---|---|
| `super_admin` | `platform` | All sites | The platform operator |
| `owner` | `owned` | `parking_sites.owner_id = this owner` | The parking business |
| `guard` | `assigned` | The sites in `guard_site_assignments` | The on-site staff |
| `user` | `self` | None | The registered motorcycle owner |

A user may hold more than one scope in practice (a guard who also owns a site). The resolved scope
is the **union** of the derived sets, never a single value.

## 3. The full permission matrix

| Permission | Super admin | Owner | Guard (assigned) | Guard (manager) | Registered user | Guest |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `platform.sites.read` | ✔ all | — | — | — | — | — |
| `platform.sites.create` | ✔ | — | — | — | — | — |
| `platform.sites.update` | ✔ | — | — | — | — | — |
| `platform.sites.deactivate` | ✔ | — | — | — | — | — |
| `platform.owners.read` | ✔ | — | — | — | — | — |
| `platform.owners.create` | ✔ | — | — | — | — | — |
| `platform.owners.suspend` | ✔ | — | — | — | — | — |
| `platform.users.read` | ✔ | — | — | — | — | — |
| `platform.users.suspend` | ✔ | — | — | — | — | — |
| `platform.staff.read` | ✔ | — | — | — | — | — |
| `platform.revenue.read` | ✔ all | — | — | — | — | — |
| `platform.analytics.read` | ✔ all | — | — | — | — | — |
| `platform.payments.read` | ✔ all | — | — | — | — | — |
| `platform.audit.read` | ✔ all | — | — | — | — | — |
| `platform.audit.export` | ✔ | — | — | — | — | — |
| `site.settings.read` | ✔ | ✔ owned | ✔ assigned | ✔ assigned | — | — |
| `site.settings.update` | ✔ | ✔ owned | — | ✔ assigned | — | — |
| `site.staff.read` | ✔ | ✔ owned | — | ✔ assigned | — | — |
| `site.staff.invite` | ✔ | ✔ owned | — | ✔ assigned | — | — |
| `site.staff.deactivate` | ✔ | ✔ owned | — | ✔ assigned | — | — |
| `site.pricing.read` | ✔ | ✔ owned | — | ✔ assigned | — | — |
| `site.pricing.manage` | ✔ | ✔ owned | — | ✔ assigned | — | — |
| `site.sessions.read` | ✔ | ✔ owned | ✔ assigned | ✔ assigned | — | — |
| `site.sessions.create` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.sessions.activate` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.sessions.cancel` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.entry_qr.issue` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.entry_qr.reissue` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.ticket.verify` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.exit.request` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.exit.complete` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.payments.record` | ✔ | — | ✔ assigned | ✔ assigned | — | — |
| `site.payments.exempt` | ✔ | ✔ owned | ✔ assigned (reason required) | ✔ assigned (reason required) | — | — |
| `site.review.open` | ✔ | ✔ owned | ✔ assigned | ✔ assigned | — | — |
| `site.review.resolve` | ✔ | ✔ owned | ✔ assigned (reason required) | ✔ assigned (reason required) | — | — |
| `site.reports.read` | ✔ | ✔ owned | — | ✔ assigned | — | — |
| `site.audit.read` | ✔ | ✔ owned | — | ✔ assigned | — | — |
| `account.tickets.read` | ✔ | ✔ | ✔ | ✔ | ✔ own | — |
| `account.telegram.link` | ✔ | ✔ | ✔ | ✔ | ✔ own | — |
| `ticket.claim` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (public, rate-limited) |

**Legend:** ✔ = permitted within the stated scope; — = not permitted; the scope qualifier is part
of the permission, not a hint.

## 4. The notes on the matrix

| Permission | Note |
|---|---|
| `platform.*` | The `platform` scope is required. A guard never has it, whatever their grants. |
| `site.sessions.read` vs `site.sessions.create` | The owner can read but not create. Creating a session is a guard's operational act; a spurious session would pollute the owner's revenue. |
| `site.exit.*` | Owner is **not** granted the exit permissions. An owner who wants to close a session must resolve a manual review. This keeps the "who let the bike out" question answerable. |
| `site.payments.record` | Owner is **not** granted it. Only a guard standing at the gate records a cash payment. |
| `site.payments.exempt` | Granted to the owner, and to a guard **with a mandatory reason**. The reason is the control, not the permission. |
| `site.review.resolve` | The same. A guard may resolve a case they opened, but only with a reason, and the resolution is audited. |
| `site.reports.read` | Granted to a `manager` site role. A plain guard has no business reading the revenue report. |
| `site.audit.read` | Granted to a `manager`. A plain guard does not need the audit log. |
| `account.tickets.read` | "Own" — the caller's own tickets only. A guard who is also a registered owner sees both sets, scoped separately. |
| `ticket.claim` | The only public permission. It is not scoped to a site, and it is rate-limited. |

## 5. The per-user override

A `UserPermissionGrant` can add or remove a permission for one user:

| Effect | Effect on the effective set |
|---|---|
| `GRANT` | Adds the permission. It does **not** widen the scope. A user granted `site.exit.complete` at a site they are not assigned to still gets `AUTHZ_SCOPE_DENIED`. |
| `REVOKE` | Removes the permission, **overriding** the role grant. |
| `expiresAt` in the past | The grant is treated as absent. |

**The scope is never widened by a grant.** A grant changes *what*, not *where*. This is deliberate:
the scope is the containment boundary, and it is derived only from the owner's sites and the
guard's assignments.

## 6. The enforcement points

| Point | What it decides | Where |
|---|---|---|
| `JwtAuthGuard` | Who the actor is | Every route except `@Public()` |
| `PermissionGuard` (global) | Whether the actor holds the required permission(s) | Every route except `@Public()` |
| `ScopeResolver` | Whether the target site is in the actor's scope | Every site-scoped route |
| The domain service | Whether the operation is legal in the current state | Every state-changing operation |

**The service re-checks the domain invariants under a lock.** The authorization check answers
"may this actor touch this site?"; the domain check answers "is this operation legal right now?".
Both must pass.

## 7. The public surface

| Route | Permission | Additional protection |
|---|---|---|
| `POST /auth/login` | — | The rate limit (per IP and per email), Argon2id, the uniform error message |
| `POST /auth/refresh` | — | The rotating refresh token with reuse detection |
| `POST /entry-claims/claim` | `ticket.claim` | The 256-bit single-use token, the 5-minute TTL, the per-IP and per-session rate limits |
| `POST /telegram/webhook` | — | The Telegram secret token, the update-id dedupe, the body size limit |
| `GET /health/live` | — | Nothing sensitive is returned |
| `GET /health/ready` | — | The status, the version, and the database state only |

## 8. The response codes

| Situation | Status | Code |
|---|---|---|
| No credentials | 401 | `AUTH_TOKEN_MISSING` |
| An expired access token | 401 | `AUTH_TOKEN_EXPIRED` |
| An invalid or tampered token | 401 | `AUTH_TOKEN_INVALID` |
| A suspended account | 401 / 403 | `AUTH_TOKEN_STALE` / `AUTH_ACCOUNT_SUSPENDED` |
| The permission is missing | 403 | `AUTHZ_PERMISSION_DENIED` |
| The site is out of scope | 403 | `AUTHZ_SCOPE_DENIED` |
| A CSRF failure | 403 | `AUTH_CSRF_INVALID` |
| A stale session | 401 | `AUTH_TOKEN_STALE` |
| The rate limit was exceeded | 429 | `RATE_LIMITED` |
| A route with no permission metadata | 403 | `AUTHZ_PERMISSION_DENIED` |

**The distinction between "not found" and "not permitted" is deliberate.** For a resource the
actor cannot see, the response is identical to the response for a resource that does not exist
(404 with the same body shape and timing). The error code for an out-of-scope *site* is
`AUTHZ_SCOPE_DENIED` (403); for a missing *resource* it is 404. Neither reveals the other's
existence.

## 9. The testing obligation

| Test | Requirement |
|---|---|
| Every role is denied the permissions it does not hold | RBAC-002 |
| A guard at site A is denied at site B | RBAC-007 |
| An owner at site A is denied at site B | RBAC-002 |
| A super admin without the permission is denied | RBAC-008 |
| A route with no metadata is denied | RBAC-003 |
| A public route outside the allowlist fails the build | RBAC-004 |
| An out-of-scope response is identical to a not-found response | RBAC-016 |
| A revocation takes effect on the next request | RBAC-011 |
| A per-user `REVOKE` beats the role grant | RBAC-009 |
| An expired grant is treated as absent | RBAC-014 |
| An exemption or a resolution without a reason is rejected | RBAC-015 |

Every one of these is an **API-boundary** test — a real HTTP request with a real token against a
real database. A unit test of the guard is not sufficient, because the guard's correctness depends
on how the route, the scope resolution, and the service interact.

## 10. The related documents

* `specs/architecture/rbac-design.md` — the full design, including the request-flow trace and the
  revenue/adoption metric SQL.
* `specs/security/threat-model.md` — the analysis these controls answer.
* `specs/features/authorization/` — the requirements and the acceptance criteria.
* `specs/data/schema.md` — the RBAC models.
* ADR-006 — the decision to use permission-based RBAC.
