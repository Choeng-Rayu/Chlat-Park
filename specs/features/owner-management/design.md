# Owner Management — Design

**Status:** In progress
**Requirement IDs:** OWN-001 … OWN-012

---

## 1. Architecture

```
apps/web (owner console)                apps/api
────────────────────────                 ──────────────────────────────────────────────
/owner/sites                 ──────────▶ ParkingSitesController
  list, create, edit                       └─ scope: owned sites only

/owner/sites/[siteId]/staff  ──────────▶ GuardsController
  invite, deactivate                       └─ creates a pending user + a SecurityGuard
                                                + a GuardSiteAssignment (role: guard|manager)

/owner/sites/[siteId]/pricing ─────────▶ PricingController
  list, create a new version               └─ immutable versions

/owner/reports               ──────────▶ ReportsController
  filters: site, from, to, status          └─ scope-bounded aggregates

/owner/audit                 ──────────▶ AuditController
  read the site audit log                  └─ scope-bounded, read-only
```

## 2. Data model

```prisma
model ParkingOwner {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @unique @db.Uuid
  name      String
  status    OwnerStatus @default(ACTIVE)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  user      User      @relation(fields: [userId], references: [id])
  sites     ParkingSite[]
}

enum OwnerStatus { ACTIVE  SUSPENDED }

model SecurityGuard {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @unique @db.Uuid
  status    GuardStatus @default(ACTIVE)
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  user      User      @relation(fields: [userId], references: [id])
  assignments GuardSiteAssignment[]
}

enum GuardStatus { ACTIVE  DEACTIVATED }

model GuardSiteAssignment {
  id        String   @id @default(uuid()) @db.Uuid
  guardId   String   @db.Uuid
  siteId    String   @db.Uuid
  role      SiteRole @default(guard)
  status    AssignmentStatus @default(ACTIVE)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  guard     SecurityGuard @relation(fields: [guardId], references: [id])
  site      ParkingSite   @relation(fields: [siteId], references: [id])

  @@unique([guardId, siteId])
  @@index([siteId])
}

enum SiteRole { guard  manager }
enum AssignmentStatus { ACTIVE  DEACTIVATED }
```

### 2.1 Why the site role lives on the assignment

A guard who manages "S1" and works at "S2" is a manager at one site and a guard at another. Putting
the role on the assignment rather than on the user makes that expressible, and it keeps the
permission decision site-specific: the same user resolves different permission sets per site.

The `manager` site role is expressed as a **per-user grant with an explicit site list** — not by
changing the user's coarse `role`. Otherwise a manager of one site would become an owner of it.

```ts
// when a manager assignment is created
await grantsService.grant({
  userId: guard.userId,
  permissionKey: 'site.pricing.manage',
  effect: 'GRANT',
  reason: `site manager of ${siteId}`,
});
// the grant is revoked when the assignment is deactivated
```

## 3. State transitions

Owner management does not own the parking session state machine (that belongs to
`features/parking-session/`), but it does own three small state machines of its own.

### 3.1 The guard assignment

```
  (none) ──invite(role=guard|manager)──▶ ACTIVE
                                              │
                        deactivate ──────────┤
                                              ▼
                                          DEACTIVATED
                                              │
                        re-invite ────────────┘
                        (same guard + site, so the unique row is reused)
```

| From | Event | To | Effect on the scope |
|---|---|---|---|
| — | invite | ACTIVE | The site enters the guard's resolved scope |
| ACTIVE | deactivate | DEACTIVATED | The site leaves the scope **immediately** (`authzVersion` is bumped) |
| DEACTIVATED | re-invite | ACTIVE | The site re-enters the scope |

**The unique constraint on `(guardId, siteId)`** means a re-invite updates the existing row rather
than creating a second one. A guard cannot hold two assignments at the same site.

### 3.2 The user status

```
  pending ──set the first password──▶ active ──suspend──▶ suspended
                                            ▲                   │
                                            └─────reinstate─────┘
```

| From | Event | To | Effect |
|---|---|---|---|
| — | invite | pending | The guard cannot sign in yet; no password is set |
| pending | set the first password | active | The guard can sign in; the scope applies |
| active | suspend | suspended | The access is blocked immediately; the refresh tokens are revoked |
| suspended | reinstate | active | The access is restored |

**A suspended user keeps all of their data and their audit history.** Suspension changes access,
not history.

### 3.3 The site role on the assignment

```
  guard ──promote──▶ manager ──demote──▶ guard
```

| Event | Grants added | Grants removed |
|---|---|---|
| promote to `manager` | `site.settings.update`, `site.staff.read`, `site.staff.invite`, `site.staff.deactivate`, `site.pricing.read`, `site.pricing.manage`, `site.reports.read`, `site.audit.read` | — |
| demote to `guard` | — | The manager grants above |

**The role is on the assignment, not on the user.** A guard who is a `manager` at site "S1" and a
`guard` at site "S2" resolves a different permission set at each site. The scope resolver returns
the union of the sites; the permission resolver applies the grants of the specific assignment.

The manager grants are stored as **per-user grant overrides with an explicit site list**, not by
changing the user's coarse `role`. Otherwise a manager of one site would become an owner of it.

## 4. Data flow — inviting a guard

```
POST /parking-sites/:siteId/staff/invitations
  body: { name, email, siteRole }

BEGIN TX
  user        = upsert by email  → role='guard', status='pending', scopeKind='assigned'
  guard       = create SecurityGuard { userId }
  assignment  = create GuardSiteAssignment { guardId, siteId, role: siteRole }
  if siteRole === 'manager':
     grant the manager permission set to the user (with the site list)
  bump user.authzVersion
  audit 'owner.staff_invited'
COMMIT

→ 201 { invitation: { id, email, name, siteRole, status: 'pending' } }
```

**The response never contains a password and never contains a set-password token.** The set-password
link is delivered out of band and is not part of this API's response (OWN-003).

### 3.4 Deactivating an assignment

```
BEGIN TX
  assignment.status = DEACTIVATED
  revoke the manager grants for that site
  bump user.authzVersion
  audit 'owner.staff_deactivated' { guardId, siteId }
COMMIT
```

The `authzVersion` bump is what makes the change take effect on the guard's next request rather
than at token expiry (OWN-005, RBAC-011).

## 5. Report design

### 5.1 The report shape

```jsonc
{
  "range": { "from": "2026-10-01T00:00:00Z", "to": "2026-11-01T00:00:00Z" },
  "sites": ["…"],
  "totals": {
    "sessions": 412,
    "completed": 388,
    "cancelled": 9,
    "pending": 15,
    "collectedMinor": 51200,
    "exemptMinor": 3000,
    "voidedMinor": 1500,
    "uncollectedMinor": 4500,
    "uncollectedSessions": 6,
    "currency": "USD"
  },
  "bySite": [ { "siteId": "…", "siteName": "…", "…": "…" } ],
  "byDay":   [ { "date": "2026-10-01", "sessions": 21, "collectedMinor": 2400 } ]
}
```

All amounts are integer minor units, and the currency is the site's (OWN-008). A report spanning
two sites with different currencies is rejected — the API groups by site and requires a single
currency per query.

### 5.2 Uncollected at close

```sql
SELECT s.site_id,
       COUNT(*)                    AS uncollected_sessions,
       SUM(s.fee_amount_minor)     AS uncollected_minor
FROM parking_sessions s
WHERE s.status = 'COMPLETED'
  AND s.exit_at >= $from AND s.exit_at < $to
  AND s.site_id = ANY($siteIds)
  AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.session_id = s.id AND p.status = 'PAID'
  )
GROUP BY s.site_id;
```

This relies on the fee snapshot (`fee_amount_minor`) written at exit completion. Without the
snapshot, the "uncollected" figure would have to be re-priced with today's policy, which would be
wrong.

### 5.3 No raw plate lists

The owner report is an aggregate report. A session-level list shows the session id, the times, the
status, and the amounts — but **not** the plate (OWN-011). A guard-facing session list *does* show
the plate, because the guard needs it to identify the motorcycle. The difference is the permission:
`site.sessions.read` is granted to both, but the **DTO** for the owner report omits the plate.

The plate is available to the owner through the audit log only in aggregate form; a per-plate view
is a super-admin-only, audited action.

## 6. Failure handling

| Failure | Response | Handling |
|---|---|---|
| An unknown site | 404 `PARK_SITE_NOT_FOUND` | Identical for a site the owner does not own (RBAC-016) |
| A duplicate invitation for the same email at the same site | 409 `OWN_ALREADY_ASSIGNED` | The existing assignment is offered instead |
| An invitation to a site the owner does not own | 403 `AUTHZ_SCOPE_DENIED` | — |
| A price change on an effective version | 409 `PRICE_POLICY_IMMUTABLE` | Create a new version instead |
| A report across two currencies | 400 `VALIDATION_FAILED` | The UI groups by site |
| A suspended owner | 403 `AUTHZ_OWNER_SUSPENDED` | Their access is blocked; the data is retained |
| A guard's `authzVersion` bump fails | 500 | The transaction rolls back — a half-applied deactivation is worse than none |

## 7. Security considerations

| Threat | Control |
|---|---|
| An owner reading another owner's data | Every owner-facing query is scope-bounded; the scope check runs on every endpoint |
| An owner enumerating site ids | 403 for out-of-scope ids, identical to a non-existent id |
| An owner setting a guard's password | The invite DTO is strict; the password field is rejected; the guard sets their own |
| An owner promoting a guard to super admin | The owner-facing endpoints have no role-writing capability; `role` is writable only through the super-admin grant endpoint (RBAC-012) |
| An owner granting permissions outside their sites | The grant endpoint is super-admin only; the owner-facing flow only creates site-role assignments |
| An owner seeing a raw plate list | The owner report DTO omits the plate (OWN-011) |
| An owner deleting an audit record | No delete operation exists on the audit resource |
| A fired guard keeping access | The assignment deactivation bumps `authzVersion`; the scope is recomputed on the next request |
| A guard sharing their account | Personal accounts; the audit trail attributes every action to a named person |

## 8. Observability

| Event | Where |
|---|---|
| `owner.staff_invited` | Audit log (owner, guard, site, site role) |
| `owner.staff_deactivated` | Audit log (owner, guard, site) |
| `owner.site_created` / `owner.site_updated` | Audit log |
| `owner.pricing_created` | Audit log (site, version, rule type) |
| `owner.suspended` / `owner.reinstated` | Audit log (platform admin, owner, reason) |
| `staff_invited_total{site}` | Metrics |
| `guard_active_sites` | Gauge — a drop means guards lost their assignments |

## 9. Alternatives considered

| Alternative | Why rejected |
|---|---|
| A `manager` boolean on the user | A user may be a manager at one site and a guard at another. The role belongs on the assignment. |
| The owner setting the guard's password | Creates a shared credential and breaks attribution. |
| Giving an owner the `owner` role's permissions globally | Breaks the scope model. The scope is what contains a breach. |
| Showing the owner a per-plate session list | Plate data is personal data of the motorcycle's owner, who may not be the parking customer. Aggregates are enough for the business question. |
| Soft-deleting a deactivated guard's history | The audit trail must survive. Deactivation changes access, not history. |
| Letting the owner grant arbitrary permissions | The permission catalogue is controlled; the owner's lever is the site role. |
