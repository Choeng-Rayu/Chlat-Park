# Authorization (RBAC) — Design

**Status:** In progress
**Requirement IDs:** RBAC-001 … RBAC-016
**Design of record:** `specs/architecture/rbac-design.md`

---

## 1. Architecture

```
                    ┌──────────────────────────────────────────────────────┐
                    │                   apps/api                          │
  request ─────────▶│  RequestIdInterceptor                                │
                    │       │                                              │
                    │       ▼                                              │
                    │  JwtAuthGuard ──▶ ActorContext {                     │
                    │       │            userId, role, scopeKind,          │
                    │       │            ownerProfileId, guardProfileId,   │
                    │       │            authzVersion, reauthAt }          │
                    │       ▼                                              │
                    │  PermissionGuard  (global APP_GUARD)                 │
                    │       │                                              │
                    │       ├── @Public()? ──yes──▶ skip                   │
                    │       │                                              │
                    │       ├── AuthorizationService.hasPermission()       │
                    │       │     role_permissions ∪ GRANT − REVOKE        │
                    │       │     (cached 30 s, keyed by authzVersion)     │
                    │       │                                              │
                    │       └── ScopeResolver                             │
                    │             ├── target site resolution              │
                    │             │    :siteId param → session → resource  │
                    │             └── isInScope(actor, siteId)             │
                    │                   platform → all                     │
                    │                   owned/assigned set → membership    │
                    │       │                                              │
                    │       ▼ 403 AUTHZ_PERMISSION_DENIED / AUTHZ_SCOPE_DENIED
                    │  ZodValidationPipe (DTO)                             │
                    │       ▼                                              │
                    │  Controller → Domain service (re-checks invariants)  │
                    │       ▼                                              │
                    │  AuditInterceptor / AuditModule                     │
                    └──────────────────────────────────────────────────────┘
```

**One check function for every role.** `AuthorizationService.can(actor, permission, siteId)` is the
only place that decides. The controller never branches on the actor's role.

## 2. Data model

See `specs/architecture/rbac-design.md` §8 for the full Prisma models. Summary of the entities
involved:

| Model | Role in the check |
|---|---|
| `users` | `role` (coarse), `scopeKind` (primary scope), `authzVersion` (cache key + revocation) |
| `permissions` | The catalogue; `key` is the primary key |
| `role_permissions` | Role → permission grants (the coarse layer's fine-grained backing) |
| `user_permission_grants` | Per-user `GRANT` / `REVOKE` overrides with optional expiry |
| `parking_owners` | Links a user to owned sites |
| `security_guards` | Links a user to a guard profile |
| `guard_site_assignments` | Links a guard to sites, with a site role (`guard` \| `manager`) |

### 2.1 Seeding

The seed script loads the catalogue from `@chlat/contracts` and inserts:

* one `permissions` row per catalogue key,
* `role_permissions` rows per the matrix in `specs/security/access-control-matrix.md`,
* a `super_admin` user with the full platform grant set.

Role permission sets at seed time:

| Role | Permission keys |
|---|---|
| `super_admin` | every key in the catalogue |
| `owner` | `site.settings.read`, `site.settings.update`, `site.staff.read`, `site.staff.invite`, `site.staff.deactivate`, `site.pricing.read`, `site.pricing.manage`, `site.sessions.read`, `site.payments.exempt`, `site.review.open`, `site.review.resolve`, `site.reports.read`, `site.audit.read`, `account.tickets.read`, `account.telegram.link`, `ticket.claim` |
| `guard` | `site.sessions.read`, `site.sessions.create`, `site.sessions.activate`, `site.sessions.cancel`, `site.entry_qr.issue`, `site.entry_qr.reissue`, `site.ticket.verify`, `site.exit.request`, `site.exit.complete`, `site.payments.record`, `site.payments.exempt`, `site.review.open`, `site.review.resolve`, `account.tickets.read`, `account.telegram.link`, `ticket.claim` |
| `user` | `account.tickets.read`, `account.telegram.link`, `ticket.claim` |

The `manager` site role on a guard assignment adds the owner-equivalent site permissions to that
guard at that site (see `specs/architecture/rbac-design.md` §4.3). This is expressed as a
`GRANT` override on the guard's user, scoped by an explicit site list — **not** by changing the
user's coarse role, because a manager of one site must not become an owner of it.

## 3. State transitions

### 3.1 Grant lifecycle

```
  (none) ──GRANT with expiresAt──▶ ACTIVE ──now > expiresAt──▶ EXPIRED
     │                                  │
     │                                  └──REVOKE──▶ REVOKED (override in force)
     └──REVOKE──▶ REVOKED (role grant suppressed)
```

| From | Event | To | Effect on the effective set |
|---|---|---|---|
| — | `GRANT` | ACTIVE | Adds the permission |
| ACTIVE | `expiresAt` passes | EXPIRED | Removes the permission |
| ACTIVE | `REVOKE` | REVOKED | Removes the permission (overrides the role grant) |
| — | `REVOKE` | REVOKED | Suppresses the role grant |

### 3.2 Assignment lifecycle

```
  (none) ──assign(role=guard|manager)──▶ ASSIGNED ──deactivate──▶ DEACTIVATED
                                                └─user suspended──▶ (inactive)
```

A deactivated assignment removes the site from the actor's resolved scope immediately (through the
`authzVersion` bump).

## 4. Failure handling

| Failure | Response | Handling |
|---|---|---|
| Route has no metadata | 403 `AUTHZ_PERMISSION_DENIED` | The build is also broken by the route audit |
| Permission missing | 403 `AUTHZ_PERMISSION_DENIED` | Audit `authz.permission_denied` |
| Target site unresolvable | 400 `VALIDATION_FAILED` / 404 | Never silently treat as "in scope" |
| Site out of scope | 403 `AUTHZ_SCOPE_DENIED` | Audit `authz.scope_denied` |
| `authzVersion` mismatch | 401 `AUTH_TOKEN_STALE` | The client refreshes and retries |
| Permission cache stale | Up to 30 s of staleness | Mitigated by the eager `authzVersion` bump; the TTL is a backstop |
| DB unavailable during the check | 503 `SERVICE_UNAVAILABLE` | **Fail closed.** Never fall back to "allow" |
| `@Public()` on an unlisted route | Build failure | The route audit enforces the allowlist |

**Fail-closed principle:** if the authorization subsystem cannot answer, the request is denied. An
authorization outage must not become an authorization bypass.

## 5. Security considerations

| Threat | Control |
|---|---|
| Privilege escalation via a copied `if (isAdmin)` | The route audit plus a CI grep for `isSuperAdmin`/`isAdmin` outside the authorization module |
| Horizontal escalation (guard → other sites) | Scope check on every site-scoped route |
| Vertical escalation (guard → owner) | The fine-grained check against role grants + per-user overrides |
| Stale privilege after revocation | `authzVersion` bump + eager cache invalidation |
| IDOR on `sessionId` / `siteId` | The scope check resolves the *loaded resource's* site, not just the route param |
| Information leak on out-of-scope resources | Identical responses for "does not exist" and "not permitted" (RBAC-016) |
| Mass assignment of `role` | `role` is never accepted from a request body; only from a super-admin-only endpoint |
| Grant without a reason | `REVOKE` and site-role changes require a reason; stored with the audit row |
| Audit flooding by probing | Permission-denial audit rows are rate-limited per actor |
| Cache poisoning across users | The cache key includes `userId` and `authzVersion` |

### 5.1 The `@Public()` allowlist (MVP)

| Method | Path | Reason |
|---|---|---|
| POST | `/api/v1/auth/login` | No session exists yet |
| POST | `/api/v1/auth/refresh` | The access token is expired by definition |
| POST | `/api/v1/entry-claims/claim` | The claim token *is* the credential; rate-limited |
| POST | `/api/v1/telegram/webhook` | Authenticated by the Telegram secret token, not by a session |
| GET | `/api/v1/health/live` | Process liveness |
| GET | `/api/v1/health/ready` | Dependency readiness |

Any new public route requires a threat-model update. The allowlist is enforced by the route audit
test (RBAC-004).

## 6. Observability

| Event | Where |
|---|---|
| `authz.permission_denied` | Audit log + metric `authz_denied_total{kind}` |
| `authz.scope_denied` | Audit log + metric |
| `authz.grant_created` / `authz.grant_revoked` | Audit log (actor, target, permission, effect, reason) |
| `authz.assignment_changed` | Audit log (actor, guard, site, role, action) |
| `authz.cache_hit` / `authz.cache_miss` | Metrics (not audit) |

## 7. Alternatives considered

| Alternative | Why rejected |
|---|---|
| Role checks in controllers (`if (role === 'owner')`) | Not composable, not testable at the boundary, and trivially bypassed by a forgotten check. |
| A single `isAdmin` boolean | Same problem, plus it makes "scope" invisible. |
| Checking the scope in the service layer only | The service layer is where domain invariants live; mixing authorization into it makes the domain rules harder to test and to reason about. A dedicated guard keeps them separate. |
| Caching permissions in the JWT only | Revocation would not take effect until the token expired. |
| Row-level security in Postgres | Postgres RLS is attractive but interacts badly with a pooled connection and an ORM; the application-level scope check is explicit, portable, and testable. Revisit if the platform scales to many owners. |
| A "super admin bypass" | A permanent bypass is a permanent vulnerability. Platform scope achieves the same result and stays auditable. |
