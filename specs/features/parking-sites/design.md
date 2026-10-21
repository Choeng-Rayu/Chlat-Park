# Parking Sites — Design

**Status:** In progress
**Requirement IDs:** PARK-001 … PARK-010

---

## 1. Architecture

```
apps/web                                   apps/api
────────                                   ────────────────────────────────────────────
Guard dashboard                            ParkingSitesController
  GET /api/v1/parking-sites  ────────────▶  @RequirePermissions('site.settings.read')
  (sites in my scope)                        └─ ScopeResolver filters by scope
        ▲                                       └─ returns { items[], page, total }
        │
  selected site (client state)               ParkingSitesService
  ──────────────── siteId on every request ──▶  createSite()   owner from the actor
                                                updateSite()
                                                deactivateSite()
                                                     │
                                                     ▼
                                                Prisma → parking_sessions
```

**The site selection is a client convenience with a server-side guarantee.** The client stores the
selected site so the UI can render; the server re-derives the authority on every request. A guard
who tampers with the selected site id in the browser simply gets `AUTHZ_SCOPE_DENIED`.

## 2. Data model

```prisma
model ParkingSite {
  id           String   @id @default(uuid()) @db.Uuid
  ownerId      String   @db.Uuid
  name         String
  address      String?
  timezone     String   @default("Asia/Phnom_Penh")
  currency     String   @default("USD")
  status       SiteStatus @default(ACTIVE)
  settingsJson Json     @default("{}")
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @db.Timestamptz(3)

  owner        ParkingOwner @relation(fields: [ownerId], references: [id])
  sessions     ParkingSession[]
  claims       EntryClaim[]
  tickets      Ticket[]
  payments     Payment[]
  assignments  GuardSiteAssignment[]
  pricingPolicies PricingPolicy[]

  @@index([ownerId])
  @@index([status])
}

enum SiteStatus { ACTIVE  DEACTIVATED }
```

### 2.1 `settingsJson`

```jsonc
{
  "entryClaimTtlSeconds": 300,        // 60..3600, default 300   (PARK-007)
  "acceptedPaymentMethods": ["CASH"], // PARK-006
  "maxActiveSessionsPerPlate": 1,     // 1 = "one active session per plate" (PARK-008)
  "gracePeriodMinutes": 0,            // minutes after expiry that the fee is not yet charged
  "requirePlatePhoto": false,         // reserved; camera work is out of scope
  "defaultLanguage": "km"             // the site's display language
}
```

`settingsJson` is read through a Zod schema in `@chlat/contracts`
(`ParkingSiteSettings`), so an unknown or malformed key is rejected on write rather than surfacing
as a runtime error later.

### 2.2 Why a JSON column and not 12 columns

The settings are read and written as a unit, they change between releases, and they are inherently
per-site configuration. A JSON column with a validated schema keeps migrations cheap while
preserving type safety at the boundary. The fields that are *queried* — `owner_id`, `status` —
remain real columns with indexes.

## 3. State transitions

### 3.1 Site status

```
  ACTIVE ──deactivate (super admin)──▶ DEACTIVATED ──reactivate──▶ ACTIVE
     │                                       │
     │                                       └── new session creation is rejected
     └── new session creation is allowed
```

| From | Event | To | Preconditions | Effect |
|---|---|---|---|---|
| — | create | ACTIVE | actor has `site.sites.create` (owner) or `platform.sites.create` (super admin) | The site is immediately usable |
| ACTIVE | deactivate | DEACTIVATED | actor has `platform.sites.deactivate` | New sessions rejected; existing data retained |
| DEACTIVATED | reactivate | ACTIVE | actor has `platform.sites.deactivate` | Deferred decision (PARK Q3) |

### 3.2 Site configuration updates

| Field | Change allowed | Audit |
|---|---|---|
| `name`, `address`, `timezone` | Yes, by the owner or a super admin | `site.settings.updated` with the changed field names |
| `currency` | **No** once the site has any session | `site.settings.currency_change_rejected` |
| `settingsJson.entryClaimTtlSeconds` | Yes | `site.settings.updated` |
| `settingsJson.acceptedPaymentMethods` | Yes | `site.settings.updated` |
| `settingsJson.maxActiveSessionsPerPlate` | Yes | `site.settings.updated` |
| `status` | Only via deactivate/reactivate | `site.deactivated` / `site.reactivated` |

**The currency is immutable after the first session.** Changing it would make historical amounts
meaningless, since `fee_amount_minor` is stored without a conversion.

## 4. Failure handling

| Failure | Response | Handling |
|---|---|---|
| Site not found | 404 `PARK_SITE_NOT_FOUND` | Identical response for "not found" and "not in scope" (RBAC-016) |
| Site out of scope | 403 `AUTHZ_SCOPE_DENIED` | Audited |
| Site deactivated | 409 `PARK_SITE_DEACTIVATED` | Blocked at session creation |
| Invalid timezone / currency | 400 `VALIDATION_FAILED` | Field-level details |
| Duplicate active session for the same plate | 409 `PARK_DUPLICATE_ACTIVE_SESSION` | The error body includes the existing session id and its entry time so the guard can act |
| Malformed `settingsJson` | 400 `VALIDATION_FAILED` | Rejected on write |
| Currency change after the first session | 409 `PARK_SITE_CURRENCY_IMMUTABLE` | |

### 4.1 The duplicate-active-session check

Enforced **at the site level**, inside the same transaction that creates the session:

```sql
-- only when settings.maxActiveSessionsPerPlate = 1
SELECT id FROM parking_sessions
WHERE site_id = $siteId
  AND plate_id_normalized = $plate
  AND status IN ('PENDING_CLAIM','ACTIVE','EXIT_PENDING')
FOR UPDATE;
```

A partial unique index is **not** used, because a plate legitimately parks at two different sites
at once, and because `PENDING_CLAIM` rows must be lockable and inspectable. The `FOR UPDATE` lock
prevents two concurrent creations from both passing the check.

## 5. Security considerations

| Threat | Control |
|---|---|
| Client-supplied `ownerId` | The owner is derived from the actor; the body's `ownerId` is ignored and stripped by the DTO schema |
| Cross-site access | The scope check on every site-scoped request |
| Site enumeration | A list returns only in-scope sites; direct access to an out-of-scope id returns the same response as a non-existent id |
| Timezone injection | The value is validated against the IANA list; it is never interpolated into a query |
| JSON settings abuse | The settings schema rejects unknown keys; the column is never used to build a dynamic query |
| Currency tampering | The currency comes from the site, never from the request; a fee is computed with the server-side pricing policy |
| Privilege change via settings | `settingsJson` contains no permission-bearing fields; the scope of a site is derived from `owner_id` and the assignments table, never from settings |

## 6. Observability

| Event | Where |
|---|---|
| `site.created` | Audit log (actor, site, owner) |
| `site.settings.updated` | Audit log (actor, site, changed fields) |
| `site.deactivated` / `site.reactivated` | Audit log (actor, site, reason) |
| `PARK_DUPLICATE_ACTIVE_SESSION` | Metrics counter per site — a spike means the guard is not checking the bike |
| `site.settings.currency_change_rejected` | Metrics counter |

## 7. Alternatives considered

| Alternative | Why rejected |
|---|---|
| One implicit site per user | Ambiguous with multiple assignments; produces wrong-lot errors. |
| Global unique constraint on the plate | A motorcycle may park at two sites at once, or return later. The constraint must be scoped to the site. |
| A `sites` string array on the user | Not referentially sound; cannot be joined, indexed, or audited per assignment. |
| Storing the timezone only on the owner | Sites in different regions would display the wrong local time. |
| Making the currency mutable | Would invalidate stored minor-unit amounts. |
| Separate columns for every setting | Twelve migrations for configuration that changes together. A validated JSON column keeps migrations cheap. |
