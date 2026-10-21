# Chlat-Park — RBAC Design

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`../security/access-control-matrix.md`](../security/access-control-matrix.md) · [`../features/authorization/`](../features/authorization/) · [`../features/admin-console/`](../features/admin-console/) · ADR-006, ADR-010

---

## 1. Purpose

This is the authoritative description of **how Chlat-Park decides who may do what, where**. It
covers the permission catalogue, the scope model, the enforcement mechanism, the deny-by-default
rule, the two-layer authorization model, and the platform-console data design (revenue and
adoption metrics) that depends on it.

The design goal: **one check function serves every role.** Authorization is data, not a code
branch.

## 2. Principles

| # | Principle |
|---|---|
| P1 | **Permission** answers *what*. **Scope** answers *where*. Both are required for an allow. |
| P2 | **Super admin is not a bypass.** It is a wider scope plus a full grant set, evaluated by the identical check path. There is no `if (isSuperAdmin) return allow` anywhere in the codebase. |
| P3 | **Deny by default.** A route with no `@RequirePermissions(...)` and no `@Public()` returns 403. There is no implicit-allow path. |
| P4 | **The backend decides.** A hidden button is UX, not authorization. Every check happens server-side. |
| P5 | **Revocation is immediate.** Revoking a permission or a site assignment takes effect at once, not at token expiry. |
| P6 | **Every privileged action is auditable.** Authorization decisions on sensitive actions are recorded with actor, target, and outcome. |
| P7 | **Scope is data.** Adding a site to a guard's assignments must not require a code change or a redeploy. |

## 3. The permission catalogue

Source of truth: `packages/contracts/src/permissions.ts`. The catalogue is a plain, typed constant
so that the API, the web app, the seed script, and the CI route audit all read the same list.

### 3.1 `platform.*` — super admin only

| Permission | Description | Scope kind | Notes |
|---|---|---|---|
| `platform.sites.read` | List and read any parking site across the platform | platform | |
| `platform.sites.create` | Create a parking site for any owner | platform | Owner must exist; see `platform.owners.create` |
| `platform.sites.update` | Modify any site's name, address, timezone, currency, status | platform | |
| `platform.sites.deactivate` | Deactivate (soft-delete) a site; blocks new sessions | platform | Existing sessions are **not** deleted |
| `platform.owners.read` | List and read parking owners | platform | |
| `platform.owners.create` | Create a parking owner account and profile | platform | |
| `platform.owners.suspend` | Suspend an owner: blocks login, keeps data | platform | Sessions and payments are retained for audit |
| `platform.users.read` | List and read user accounts across the platform | platform | Never exposes `passwordHash` |
| `platform.users.suspend` | Suspend or reinstate a user account | platform | |
| `platform.staff.read` | List guards, owners, and staff across the platform | platform | |
| `platform.revenue.read` | Read platform revenue aggregates (collected / exempt / voided / failed) | platform | Aggregates only — never a raw transaction list without a per-site report grant |
| `platform.analytics.read` | Read adoption and funnel analytics | platform | Aggregates; per-plate detail is a separate, audited action |
| `platform.payments.read` | Read payment records across the platform | platform | |
| `platform.audit.read` | Read audit log entries across the platform | platform | |
| `platform.audit.export` | Export audit log entries to a file | platform | The export action itself is audited; export is rate-limited |

### 3.2 `site.*` — site-scoped

| Permission | Description | Scope kind | Who holds it |
|---|---|---|---|
| `site.settings.read` | Read the site's settings (timezone, currency, accepted payment methods, entry-claim TTL) | site | owner (owned), manager (assigned), super admin |
| `site.settings.update` | Change the site's settings | site | owner (owned), super admin |
| `site.staff.read` | List the site's guards and their assignments | site | owner, manager, super admin |
| `site.staff.invite` | Invite a guard to the site | site | owner, super admin |
| `site.staff.deactivate` | Deactivate a guard's assignment to the site | site | owner, super admin |
| `site.pricing.read` | Read the site's pricing policies and versions | site | owner, manager, super admin |
| `site.pricing.manage` | Create a new pricing policy version, set the effective policy, deactivate a policy | site | owner, super admin |
| `site.sessions.read` | List and read the site's parking sessions | site | owner, guard, manager, super admin |
| `site.sessions.create` | Create a parking session (entry) | site | guard, manager, super admin |
| `site.sessions.activate` | Manually activate a never-claimed `PENDING_CLAIM` session | site | guard, manager, super admin |
| `site.sessions.cancel` | Cancel a `PENDING_CLAIM` session | site | guard, manager, super admin |
| `site.entry_qr.issue` | Issue an entry QR for a session | site | guard, manager, super admin |
| `site.entry_qr.reissue` | Reissue (rotate) the entry QR of a pending session | site | guard, manager, super admin |
| `site.ticket.verify` | Verify a ticket and read the exit details | site | guard, manager, super admin |
| `site.exit.request` | Move a session to `EXIT_PENDING` | site | guard, manager, super admin |
| `site.exit.complete` | Complete the exit of a session | site | guard, manager, super admin |
| `site.payments.record` | Record a manual payment result | site | guard, manager, super admin |
| `site.payments.exempt` | Grant a fee exemption with a reason | site | owner, manager, super admin — **guards require a reason** |
| `site.review.open` | Open a manual review case | site | guard, manager, owner, super admin |
| `site.review.resolve` | Resolve a manual review case (with an audit reason) | site | owner, manager, super admin — **guards may resolve only with a reason** |
| `site.reports.read` | Read the site's reports (sessions, payments, totals) with filters | site | owner, super admin |
| `site.audit.read` | Read audit log entries for the site | site | owner, manager, super admin |

### 3.3 `account.*` — self-scoped

| Permission | Description | Scope kind |
|---|---|---|
| `account.tickets.read` | Read the tickets linked to the caller's own account | self |
| `account.telegram.link` | Link or unlink a Telegram identity to the caller's account | self |

### 3.4 Public

| Permission | Description | Scope kind | Notes |
|---|---|---|---|
| `ticket.claim` | Claim an entry QR and receive an e-ticket | public | **No account.** Rate-limited, single-use token, audited |

### 3.5 Catalogue shape in code

```ts
// packages/contracts/src/permissions.ts
export const PERMISSIONS = {
  'platform.sites.read':        { description: 'List and read any parking site across the platform',       scopeKind: 'platform' },
  'platform.sites.create':      { description: 'Create a parking site for any owner',                         scopeKind: 'platform' },
  // …
  'site.exit.complete':         { description: 'Complete the exit of a session',                              scopeKind: 'site' },
  'site.payments.record':       { description: 'Record a manual payment result',                            scopeKind: 'site' },
  'account.tickets.read':       { description: 'Read the tickets linked to the caller\'s own account',        scopeKind: 'self' },
  'ticket.claim':               { description: 'Claim an entry QR and receive an e-ticket',                   scopeKind: 'public' },
} as const satisfies Record<string, { description: string; scopeKind: ScopeKind }>;

export type PermissionKey = keyof typeof PERMISSIONS;
```

The `satisfies` clause makes a typo in a permission string a **compile error**, and the `as const`
makes the keys a literal union. `ScopeKind` here is the *catalogue* scope
(`platform | site | own | public`) used for documentation and seeding; the *actor* scope kinds
(`platform | owned | assigned | self`) live in the API's authorization module and are described in
§4.

## 4. The scope model

### 4.1 Two orthogonal axes

```
        WHAT ──────────────▶ Permission  ('site.exit.complete')
        WHERE ──────────────▶ Scope       ({ siteId: '…' } for the target site)
                 both required ──▶ ALLOW
```

A permission without a scope is meaningless (`site.exit.complete` at *which* site?), and a scope
without a permission is meaningless (a guard may read sessions but may not create one). The check
requires both.

### 4.2 Actor scope kinds

| `scopeKind` | Definition | How it is computed | Used by |
|---|---|---|---|
| `platform` | All sites | `null` marker → matches every site | super admin |
| `owned` | Sites the actor owns | `parking_sites.owner_id = user.ownerProfile.id` | parking owner |
| `assigned` | Sites the actor is assigned to | `guard_site_assignments.site_id` for the actor's `SecurityGuard` row | security guard |
| `self` | No site scope — only the actor's own resources | empty site set | registered owner |

A user may hold **more than one** scope kind in practice (e.g. a guard who also owns a site). The
resolved scope is the **union** of the scope sets derived from the actor's data, never a
single-value field. `users.scopeKind` records the *primary* kind for display and for coarse
routing; the fine-grained resolver uses the union.

### 4.3 The site-role on an assignment

`guard_site_assignments.role` is `guard | manager`:

| Site role | Adds |
|---|---|
| `guard` | The operational permissions: create sessions, issue entry QR, verify, exit, record payments, open reviews |
| `manager` | The guard set **plus** `site.settings.update`, `site.staff.read`, `site.staff.invite`, `site.staff.deactivate`, `site.pricing.read`, `site.pricing.manage`, `site.reports.read`, `site.audit.read`, `site.payments.exempt`, `site.review.resolve` |

`site.sessions.*` at the site level always applies to a guard; a manager's extra site-management
permissions come from `role_permissions` seeded per assignment role.

### 4.4 Resolution algorithm

```ts
// apps/api/src/modules/authorization/scope-resolver.service.ts
export type ResolvedScope =
  | { kind: 'platform' }
  | { kind: 'site'; siteIds: string[] }
  | { kind: 'self' };

export class ScopeResolver {
  async resolve(actor: ActorContext): Promise<ResolvedScope> {
    if (actor.user.scopeKind === 'platform') {
      return { kind: 'platform' };                 // wider scope, NOT a bypass
    }
    const siteIds = new Set<string>();
    if (actor.ownerProfileId) {
      const owned = await this.prisma.parkingSite.findMany({
        where: { owner_id: actor.ownerProfileId, status: { not: 'DEACTIVATED' } },
        select: { id: true },
      });
      owned.forEach(s => siteIds.add(s.id));
    }
    if (actor.guardProfileId) {
      const assigned = await this.prisma.guardSiteAssignment.findMany({
        where: { guard_id: actor.guardProfileId },
        select: { site_id: true },
      });
      assigned.forEach(s => siteIds.add(s.id));
    }
    return { kind: 'site', siteIds: [...siteIds] };
  }
}
```

**Note on `platform`:** the marker does not skip the permission check. A super admin still needs the
*permission* (`site.exit.complete`) to exit a session; the platform scope only answers *where*.

## 5. Enforcement mechanism

### 5.1 Components

| Component | Responsibility | Nest registration |
|---|---|---|
| `JwtAuthGuard` | Verifies the access token, loads the actor, attaches it to the request. Skipped on `@Public()` routes. | `@UseGuards` on public routes, or globally with a `@Public()` bypass |
| `PermissionGuard` | Reads `@RequirePermissions(...)` metadata; delegates to `AuthorizationService`; returns 403 on failure. | **Global `APP_GUARD`** — it runs for every route |
| `AuthorizationService` | Resolves fine-grained grants from the DB (role permissions + per-user overrides) with a short-TTL in-process cache. | Injected into `PermissionGuard` |
| `ScopeResolver` | Resolves the target site and tests it against the actor's scope set. | Injected into `PermissionGuard` |
| `SiteContext` | Extracts the target site id from the route param, the loaded session, or the resource. | Injected into `ScopeResolver` |

### 5.2 The request-flow trace

```
Request: POST /api/v1/parking-sessions/6f1c…/exit/complete
         Authorization: Bearer <jwt>

 1. RequestIdInterceptor
      → request.requestId = "01JB9Z0K…"

 2. JwtAuthGuard
      → verify signature, exp, iss, aud
      → load user by sub; reject if status != 'active'
      → request.actor = { userId, role, scopeKind, ownerProfileId, guardProfileId, authzVersion }

 3. PermissionGuard (global)
      a. read metadata:  @RequirePermissions('site.exit.complete')
      b. if route is @Public() → skip (only claim/health/webhook are public)
      c. AuthorizationService.hasPermission(actor, 'site.exit.complete')
           → effective permissions = role_permissions[actor.role]
                                  ∪ user_permission_grants(userId, effect=GRANT)
                                  − user_permission_grants(userId, effect=REVOKE)
           → miss ⇒ 403 { code: 'AUTHZ_PERMISSION_DENIED' }
      d. ScopeResolver.resolveTargetSite(request)
           → :sessionId is not a site ⇒ load the session ⇒ session.site_id
      e. ScopeResolver.isInScope(actor, siteId)
           → platform scope ⇒ true
           → owned/assigned set contains siteId ⇒ true
           → otherwise ⇒ 403 { code: 'AUTHZ_SCOPE_DENIED' }

 4. DTO validation (global pipe, Zod schemas from @chlat/contracts)
      → 400 { code: 'VALIDATION_FAILED', details: [ … ] }

 5. Controller → service
      → the service re-reads the session inside a transaction and re-checks
        the invariants (status, payment, ticket). Authorization is necessary
        but not sufficient; the domain rules are checked again.

 6. AuditInterceptor / AuditModule
      → write the audit row inside the same transaction
```

**Why the scope check repeats in the service layer:** a scope check answers "may this actor touch
this site?". The domain check answers "is this operation legal in the current state?". Both must
pass, and the domain re-check happens under a row lock so the state cannot change between the
check and the write.

### 5.3 The decorators

```ts
// packages/contracts/src/decorators.ts (or apps/api/src/common/decorators)
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

Usage:

```ts
@Post('parking-sessions/:sessionId/exit/complete')
@RequirePermissions('site.exit.complete')
async completeExit(@Param('sessionId') id: string, @Body() dto: CompleteExitDto) { … }
```

### 5.4 The single check function

```ts
// apps/api/src/modules/authorization/authorization.service.ts
async can(actor: ActorContext, permission: PermissionKey, siteId: string | null): Promise<boolean> {
  if (!this.hasPermission(actor, permission)) return false;      // WHAT
  if (permission === 'ticket.claim') return true;                // public, no site scope
  if (!siteId) return this.isSelfScoped(actor, permission);      // account.* / self
  return await this.scopeResolver.isInScope(actor, siteId);       // WHERE
}
```

Every role — super admin, owner, guard, registered user, guest — passes through this function. The
only role-specific branch is `ticket.claim`, which is public by definition and is rate-limited
separately.

## 6. Deny-by-default

### 6.1 The rule

> A route with **no** `@RequirePermissions(...)` metadata and **no** `@Public()` returns **403**.

There is no implicit-allow path. The `PermissionGuard` treats "no metadata" as "deny" rather than
"allow".

### 6.2 The route audit test

The deny-by-default rule is not a code-review convention — it is enforced by a CI test that
enumerates the NestJS route table:

```ts
// apps/api/test/route-audit.spec.ts
import { PERMISSIONS } from '@chlat/contracts';

describe('route authorization audit', () => {
  it('every route declares @RequirePermissions or @Public()', async () => {
    const app = await createTestingApp();
    const server = app.getHttpAdapter().getInstance();
    const routes = await listRoutes(server);   // from the Nest router explorer

    const publicRoutes = new Set([
      'POST /auth/login',
      'POST /auth/refresh',
      'POST /entry-claims/claim',
      'POST /telegram/webhook',
      'GET  /health/live',
      'GET  /health/ready',
    ]);

    for (const route of routes) {
      const key = `${route.method} ${normalisePath(route.path)}`;
      const meta = reflectRouteMetadata(route.handler);
      if (!meta.permissions?.length && !meta.isPublic) {
        throw new Error(`Route ${key} has no @RequirePermissions and no @Public()`);
      }
      if (meta.isPublic && !publicRoutes.has(key)) {
        throw new Error(`Route ${key} is @Public() but is not on the reviewed allowlist`);
      }
      for (const p of meta.permissions ?? []) {
        if (!(p in PERMISSIONS)) throw new Error(`Route ${key} uses unknown permission ${p}`);
      }
    }
  });
});
```

The public allowlist is reviewed in the threat model
([`../security/threat-model.md`](../security/threat-model.md) §6) and any change to it is a
security-relevant diff.

## 7. Two-layer authorization

### 7.1 Coarse layer

* Source: `users.role` (`super_admin | owner | guard | user`), embedded in the JWT.
* Purpose: cheap, always-available classification; drives navigation and coarse branching in the
  UI; used to pick which coarse checks apply.
* Limitation: it is **not** sufficient for an allow. The coarse role only ever *narrows* what is
  possible; it never grants by itself.

### 7.2 Fine layer (authoritative)

* Source: the database — `permissions`, `role_permissions`, `user_permission_grants`, plus the
  actor's live site assignments.
* Evaluated on **every** request via `AuthorizationService`.
* `users.authzVersion` is bumped on **any** permission or assignment change. The in-process cache
  is keyed by `(userId, authzVersion)`, so a bump immediately invalidates every cached entry for
  that user. The 30-second TTL is a backstop, not the primary mechanism.
* **Eager invalidation:** grant/revoke/assignment writes bump `authzVersion` in the same
  transaction as the change.

### 7.3 Cache

| Aspect | Value |
|---|---|
| Location | In-process `Map`, per API replica |
| Key | `${userId}:${authzVersion}` |
| TTL | 30 s (hard expiry) |
| Invalidation | Eager: `authzVersion` bump on any write |
| Cross-replica | Not needed — the version is stored in the database, so every replica sees the bump |

### 7.4 Effective permission computation

```
effective(actor) = role_permissions[actor.role]
                  ∪ { g.permissionKey | g ∈ user_permission_grants, g.userId = actor.id, g.effect = GRANT, g not expired }
                  − { g.permissionKey | g ∈ user_permission_grants, g.userId = actor.id, g.effect = REVOKE }
```

A per-user `REVOKE` always wins over the role grant — that is the point of the override table.
An expired grant (`expiresAt < now()`) is treated as absent.

## 8. RBAC data model (Prisma 7)

```prisma
enum UserRole    { super_admin  owner  guard  user }
enum UserStatus  { active  suspended  pending }
enum ScopeKind   { platform  owned  assigned  self }
enum GrantEffect { GRANT  REVOKE }

model User {
  id            String    @id @default(uuid()) @db.Uuid
  email         String?   @unique
  phone         String?   @unique
  passwordHash  String?
  displayName   String?
  role          UserRole  @default(user)
  status        UserStatus @default(active)
  scopeKind     ScopeKind @default(self)
  authzVersion  Int       @default(1)   // bumped on any permission/assignment change
  createdAt     DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime  @updatedAt @db.Timestamptz(3)
  telegramIdentity TelegramIdentity?
  ownerProfile     ParkingOwner?
  guardProfile     SecurityGuard?
  grants        UserPermissionGrant[]
}

model Permission {
  key         String   @id               // 'site.exit.complete'
  description String
  scopeKind   ScopeKind                  // platform | site | own | public
  category    String
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
}

model RolePermission {
  role          UserRole
  permissionKey String
  @@id([role, permissionKey])
  @@index([permissionKey])
}

model UserPermissionGrant {               // per-user override (add or remove)
  id            String      @id @default(uuid()) @db.Uuid
  userId        String      @db.Uuid
  permissionKey String
  effect        GrantEffect @default(GRANT)
  grantedById   String?     @db.Uuid
  reason        String?
  expiresAt     DateTime?   @db.Timestamptz(3)
  createdAt     DateTime    @default(now()) @db.Timestamptz(3)
  @@unique([userId, permissionKey])
  @@index([userId])
}
```

### 8.1 Amendments to the plan's §10 schema

| Change | Reason |
|---|---|
| `guards` → `SecurityGuard` | Avoid collision with `src/common/guards/` (L1) |
| `guard_site_assignments.role` (`guard \| manager`) | Site-level hierarchy for guards |
| `users.role` + `users.status` + `users.scopeKind` | Coarse layer and actor scope |
| `users.authzVersion` | Immediate revocation |
| `Permission`, `RolePermission`, `UserPermissionGrant` | Fine layer |
| `parking_sites.owner_id` retained | 1 owner → N sites |
| `telegram_identities.user_id` nullable | A Telegram identity may exist before linking |

### 8.2 Model relationships (narrative)

```
User 1 ─── 0..1 ParkingOwner 1 ─── N ParkingSite
User 1 ─── 0..1 SecurityGuard 1 ─── N GuardSiteAssignment N ─── 1 ParkingSite
User 1 ─── N UserPermissionGrant
UserRole 1 ─── N RolePermission N ─── 1 Permission
User 1 ─── 0..1 TelegramIdentity
```

## 9. The super-admin console data model

### 9.1 Revenue

**Source of truth: the `payments` table (integer minor units).**

* `PAID` is revenue.
* `EXEMPT` is **not** revenue — it is *revenue leakage*, and it is reported as a separate, prominent
  figure so it cannot hide inside a total.
* `VOIDED` **subtracts** from revenue.
* `FAILED` is a count, not money.

```sql
SELECT s.site_id, s.owner_id,
       SUM(p.amount_minor) FILTER (WHERE p.status = 'PAID')   AS collected_minor,
       SUM(p.amount_minor) FILTER (WHERE p.status = 'EXEMPT') AS exempt_minor,
       SUM(p.amount_minor) FILTER (WHERE p.status = 'VOIDED') AS voided_minor,
       COUNT(*)        FILTER (WHERE p.status = 'FAILED')     AS failed_count
FROM payments p
JOIN parking_sessions s ON s.id = p.session_id
WHERE p.captured_at >= $from AND p.captured_at < $to
GROUP BY s.site_id, s.owner_id;
```

**Caveat that must be visible in the UI:** `captured_at` is only set on a confirmed payment. Rows
with `captured_at IS NULL` are excluded by the `WHERE` clause above; the report must also show a
count of payments in the window by `created_at` that have no `captured_at`, so that a payment
recorded but never captured cannot silently disappear from the revenue report.

### 9.2 Uncollected at close

A completed session with no `PAID` payment is uncollected revenue. To detect it reliably, the
**fee is snapshotted onto the session** in the same transaction that completes the exit:

```prisma
model ParkingSession {
  // …
  feeAmountMinor Int?     // snapshot written at exit completion
  feeCurrency     String?  // snapshot written at exit completion
}
```

```sql
SELECT s.site_id, s.owner_id,
       COUNT(*)                                                   AS uncollected_sessions,
       SUM(s.fee_amount_minor)                                    AS uncollected_minor
FROM parking_sessions s
WHERE s.status = 'COMPLETED'
  AND s.exit_at >= $from AND s.exit_at < $to
  AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.session_id = s.id AND p.status = 'PAID'
  )
GROUP BY s.site_id, s.owner_id;
```

The snapshot makes historical revenue **stable against pricing changes**: a site that changes its
tariff tomorrow does not retroactively change what was owed yesterday.

### 9.3 Pricing-version correctness

Revenue always uses the session's own `pricing_policy_id`. Today's policy never re-prices history.
The fee preview shown at exit and the fee snapshot written at exit are computed by the **same**
pricing function, so the preview and the charge cannot diverge.

### 9.4 Denormalized `payments.site_id`

`payments.site_id` is denormalized for reporting performance. The invariant
`payments.site_id = session.site_id` is **enforced in code** (the payment service copies it from
the session inside the transaction) and **verified by a nightly consistency check**:

```sql
-- nightly consistency check (see specs/data/migrations.md)
SELECT p.id
FROM payments p
JOIN parking_sessions s ON s.id = p.session_id
WHERE p.site_id IS DISTINCT FROM s.site_id;
-- must return zero rows; any row is paged as a data-integrity alert
```

### 9.5 Adoption / user counts

Registration is optional, so **guest-only usage is the normal case** and would be invisible if we
counted accounts only. Two identity channels are counted separately, then combined.

* **Registered owners** — `users` where `role = 'user'`.
* **Guests** — the only identifier a guest has is the plate. To count distinct guests without
  retaining readable plates indefinitely, `parking_sessions` gains
  `plate_digest = HMAC-SHA256(server_pepper, normalized_plate)`, indexed, retained for lifetime
  counting. The readable `plate_id_normalized` is redacted after the retention window (90 days
  default). Pepper rotation breaks historical continuity — documented in ADR-010.

```sql
-- registered owners
SELECT COUNT(*) FROM users WHERE role = 'user' AND status <> 'suspended';

-- distinct guests ever parked
SELECT COUNT(DISTINCT plate_digest) FROM parking_sessions WHERE plate_digest IS NOT NULL;

-- combined active users in a window
WITH guests AS (
  SELECT DISTINCT plate_digest AS key FROM parking_sessions
  WHERE created_at >= $from AND created_at < $to AND plate_digest IS NOT NULL
), registered AS (
  SELECT DISTINCT guest_user_id::text AS key FROM parking_sessions
  WHERE created_at >= $from AND created_at < $to AND guest_user_id IS NOT NULL
)
SELECT COUNT(*) FROM (SELECT key FROM guests UNION SELECT key FROM registered) u;
```

### 9.6 Metric catalogue

| Metric | Definition | SQL sketch |
|---|---|---|
| Total registered users | `count(users where role='user')` | §9.5 |
| Distinct guests ever parked | `count(distinct plate_digest)` over sessions | §9.5 |
| Combined active users (period) | distinct `plate_digest` ∪ distinct `guest_user_id` in window | §9.5 |
| Sessions created (period) | `count(sessions)` | `GROUP BY date_trunc('month', created_at)` |
| Entry claims issued | `count(entry_claims)` | same window |
| Tickets issued | `count(tickets)` | same window |
| Sessions completed | `count(sessions where status='COMPLETED')` | same window |
| **Claim rate** | `tickets issued / sessions created` | the truest "are owners actually using it" signal |
| Completion rate | `completed / tickets issued` | |
| Repeat rate | `distinct plates with ≥2 sessions / distinct plates` | `HAVING count(*) >= 2` |
| Registered vs guest split | sessions with `guest_user_id IS NULL` vs not | |
| Per-site / per-owner breakdown | `GROUP BY site_id / owner_id` | |
| Trend | `date_trunc('month', created_at)` → new distinct plates + sessions | |
| Uncollected at close | completed sessions with no `PAID` payment | §9.2 |
| Exemption ratio | `EXEMPT` minor units / total minor units | §9.1 |
| Voided ratio | `VOIDED` minor units / total minor units | §9.1 |

### 9.7 Privacy constraints on the admin console

* The console shows **aggregates and per-site breakdowns**, never a raw plate list.
* A **per-plate detail view** is super-admin-only, requires `platform.analytics.read` **plus** the
  explicit `platform.audit.export` grant, is written to the audit log as its own action, and is
  rate-limited.
* No endpoint returns a `plate_digest` to the client. Digests are for counting, not for display.
* Retention: see ADR-009 and ADR-010.

## 10. Access control matrix

The authoritative table lives in
[`../security/access-control-matrix.md`](../security/access-control-matrix.md). Summary:

| Permission | Super admin | Owner | Guard | Registered user | Guest |
|---|---|---|---|---|---|
| `platform.revenue.read`, `platform.analytics.read` | ✔ all sites | — | — | — | — |
| `platform.sites.*`, `platform.users.*`, `platform.owners.*` | ✔ | — | — | — | — |
| `platform.audit.read` / `.export` | ✔ | — | — | — | — |
| `site.settings.update`, `site.pricing.manage`, `site.staff.invite` | ✔ | ✔ owned | — | — | — |
| `site.reports.read` | ✔ | ✔ owned | — | — | — |
| `site.sessions.read` | ✔ | ✔ owned | ✔ assigned | — | — |
| `site.sessions.create`, `site.entry_qr.issue` | ✔ | — | ✔ assigned | — | — |
| `site.ticket.verify`, `site.exit.request`, `site.exit.complete` | ✔ | — | ✔ assigned | — | — |
| `site.payments.record` | ✔ | — | ✔ assigned | — | — |
| `site.payments.exempt`, `site.review.resolve` | ✔ | ✔ owned | ✔ assigned (reason required) | — | — |
| `account.tickets.read`, `account.telegram.link` | ✔ | ✔ | ✔ | ✔ own | — |
| `ticket.claim` | ✔ | ✔ | ✔ | ✔ | ✔ (public, rate-limited) |

## 11. Auditing authorization decisions

| Event | Recorded | Fields |
|---|---|---|
| Permission denied | Yes | actor, route, permission, target site, request id |
| Scope denied | Yes | actor, route, required site, actor scope kind, request id |
| Grant / revoke | Yes | actor, target user, permission, effect, reason |
| Assignment change | Yes | actor, guard, site, role, action |
| `platform.audit.export` | Yes | actor, filter, row count, format |
| Per-plate detail view | Yes | actor, plate digest, reason |

Permission-denied audit rows are written **after** the response is produced (they must not roll
back the request) and are rate-limited so a probing attacker cannot flood the audit table.

## 12. Consequences and trade-offs

| Consequence | Rationale |
|---|---|
| More DB work per request | Mitigated by the 30 s / `authzVersion` cache. Correctness beats a saved millisecond. |
| Two permission sources (role + grant) can disagree | Precedence is defined (§7.4) and unit-tested. |
| Super admin has no "god mode" shortcut | A shortcut is a permanent bypass; the platform scope achieves the same outcome and is auditable. |
| `site.payments.exempt` and `site.review.resolve` are shared with guards | Both require an audited reason, which is the actual control. Exempting a fee is a business decision the site makes. |

## 13. Related documents

* `specs/features/authorization/` — the feature spec for the implementation.
* `specs/security/access-control-matrix.md` — the role × permission × scope table.
* `specs/security/threat-model.md` — the `@Public()` allowlist and privilege-escalation analysis.
* `specs/data/schema.md` — the data model of record.
* ADR-006 — permission-based RBAC.
* ADR-010 — guest identity and privacy (`plate_digest`).
