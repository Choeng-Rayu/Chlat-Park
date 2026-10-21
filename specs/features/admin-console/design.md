# Admin Console — Design

**Status:** In progress
**Requirement IDs:** ADMIN-001 … ADMIN-014

---

## 1. Architecture

```
apps/web (admin console)                apps/api
────────────────────────                 ──────────────────────────────────────────────
/admin/revenue            ─────────────▶ AdminReportsController
  period, site filter                    ├─ RevenueService
                                           │   ├─ collected / exempt / voided / failed
                                           │   ├─ uncollected at close
                                           │   └─ uncaptured-payment warning
                                         ├─ AdoptionService
                                           │   ├─ registered / distinct guests / combined
                                           │   ├─ funnel + rates
                                           │   ├─ repeat rate
                                           │   ├─ registered vs guest split
                                           │   └─ monthly trend
                                         └─ AuditService (export)

/admin/owners, /admin/sites ───────────▶ OwnersController / ParkingSitesController
  create owner, create site, suspend     └─ platform.* permissions, platform scope

/admin/audit              ─────────────▶ AuditController
  read, export                           └─ platform.audit.read / platform.audit.export
```

## 2. The revenue query

```sql
-- Collected / exempt / voided / failed, per site and owner
SELECT s.site_id, s.owner_id,
       SUM(p.amount_minor) FILTER (WHERE p.status = 'PAID')   AS collected_minor,
       SUM(p.amount_minor) FILTER (WHERE p.status = 'EXEMPT') AS exempt_minor,
       SUM(p.amount_minor) FILTER (WHERE p.status = 'VOIDED') AS voided_minor,
       COUNT(*)        FILTER (WHERE p.status = 'FAILED')     AS failed_count
FROM payments p
JOIN parking_sessions s ON s.id = p.session_id
WHERE p.captured_at >= $from AND p.captured_at < $to
  AND s.site_id = ANY($siteIds)
GROUP BY s.site_id, s.owner_id;
```

### 2.1 The uncaptured-payment warning

`captured_at` is only set on a confirmed payment, so the `WHERE` clause silently excludes a
payment that was recorded but never captured. The console must therefore also run:

```sql
SELECT COUNT(*) AS uncaptured_count, COALESCE(SUM(amount_minor), 0) AS uncaptured_minor
FROM payments p
JOIN parking_sessions s ON s.id = p.session_id
WHERE p.created_at >= $from AND p.created_at < $to
  AND p.captured_at IS NULL
  AND p.status <> 'VOIDED';
```

and display it as a warning banner. This closes the "revenue looks wrong" incident class that
would otherwise be invisible.

### 2.2 Uncollected at close

```sql
SELECT s.site_id,
       COUNT(*)                AS uncollected_sessions,
       SUM(s.fee_amount_minor) AS uncollected_minor
FROM parking_sessions s
WHERE s.status = 'COMPLETED'
  AND s.exit_at >= $from AND s.exit_at < $to
  AND s.site_id = ANY($siteIds)
  AND NOT EXISTS (
    SELECT 1 FROM payments p WHERE p.session_id = s.id AND p.status = 'PAID'
  )
GROUP BY s.site_id;
```

This depends on the fee snapshot, which is why the snapshot exists.

## 3. The adoption queries

```sql
-- Registered owners
SELECT COUNT(*) FROM users WHERE role = 'user' AND status <> 'suspended';

-- Distinct guests ever parked
SELECT COUNT(DISTINCT plate_digest) FROM parking_sessions WHERE plate_digest IS NOT NULL;

-- Combined active users in a window
WITH guests AS (
  SELECT DISTINCT plate_digest AS k FROM parking_sessions
  WHERE created_at >= $from AND created_at < $to AND plate_digest IS NOT NULL
), registered AS (
  SELECT DISTINCT guest_user_id::text AS k FROM parking_sessions
  WHERE created_at >= $from AND created_at < $to AND guest_user_id IS NOT NULL
)
SELECT COUNT(*) FROM (SELECT k FROM guests UNION SELECT k FROM registered) u;

-- The funnel
SELECT
  (SELECT COUNT(*) FROM parking_sessions WHERE created_at >= $from AND created_at < $to) AS sessions_created,
  (SELECT COUNT(*) FROM entry_claims    WHERE created_at >= $from AND created_at < $to) AS claims_issued,
  (SELECT COUNT(*) FROM tickets         WHERE created_at >= $from AND created_at < $to) AS tickets_issued,
  (SELECT COUNT(*) FROM parking_sessions WHERE status = 'COMPLETED' AND exit_at >= $from AND exit_at < $to) AS sessions_completed;

-- Repeat rate
WITH plates AS (
  SELECT plate_digest, COUNT(*) AS n FROM parking_sessions
  WHERE created_at >= $from AND created_at < $to AND plate_digest IS NOT NULL
  GROUP BY plate_digest
)
SELECT COUNT(*) FILTER (WHERE n >= 2)::float / NULLIF(COUNT(*), 0) AS repeat_rate FROM plates;

-- Registered vs guest split
SELECT (guest_user_id IS NULL) AS is_guest, COUNT(*) FROM parking_sessions
WHERE created_at >= $from AND created_at < $to GROUP BY 1;

-- Monthly trend
SELECT date_trunc('month', created_at) AS month,
       COUNT(DISTINCT plate_digest) AS new_plates,
       COUNT(*) AS sessions
FROM parking_sessions
WHERE created_at >= $from AND created_at < $to
GROUP BY 1 ORDER BY 1;
```

### 3.1 Why the digest and not the plate

The plate is personal data belonging to the motorcycle's owner, who may have no relationship with
the parking lot. Counting distinct plates with `COUNT(DISTINCT plate_id_normalized)` would require
keeping the readable plate indefinitely. The HMAC digest gives the same cardinality with a
non-reversible value, and it can be dropped or rotated independently of the readable plate
(retention per ADR-009/ADR-010).

**The digest never leaves the database.** No endpoint returns it, not even to the super admin. The
per-plate view (ADMIN-011) returns a **masked** plate, not the digest.

### 3.2 The per-plate detail view

| Property | Value |
|---|---|
| Permissions | `platform.analytics.read` **and** `platform.audit.export` |
| Scope | `platform` |
| Response | A masked plate (`AB***3`), the session count, the first and last visit, the total paid |
| Never | The raw plate, the digest, the ticket tokens |
| Rate limit | 5 per minute per actor |
| Audit | `admin.plate_detail_viewed` with the actor, the masked plate, and the reason |

The masked plate is derived server-side from the digest by re-deriving the digest of a candidate
prefix — actually, simpler: the digest row is joined to the session, and the response returns a
masked form of the session's `plate_id_normalized` **only if** the retention window has not
redacted it; otherwise the plate is not returned at all. The masked form is not a secret.

## 4. State transitions

The admin console is **read-only by default**. It owns no state machine of its own; it reads the
states of the domain. There is one exception — the platform actions — and their transitions are
recorded here so that a reader can see what the console is capable of changing.

### 4.1 The platform actions

| Entity | From | To | Trigger | Actor | Effect |
|---|---|---|---|---|---|
| `parking_owners` | `active` | `suspended` | The owner is suspended | Super admin | The owner's access is blocked immediately; their data is retained |
| `parking_owners` | `suspended` | `active` | The owner is reinstated | Super admin | The access is restored |
| `users` | `active` / `pending` | `suspended` | The user is suspended | Super admin | The access is blocked; the refresh tokens are revoked |
| `users` | `suspended` | `active` | The user is reinstated | Super admin | The access is restored |
| `parking_sites` | `active` | `deactivated` | The site is deactivated | Super admin | New sessions are blocked; the history is retained |
| `parking_sites` | `deactivated` | `active` | The site is reactivated | Super admin | New sessions are allowed again |

**Every one of these is audited** with the actor, the target, and a reason (ADMIN-012). None of
them deletes anything: deactivation and suspension change access, not history.

### 4.2 The per-plate view — a read, not a state change

The per-plate detail view reads. It is deliberately the sharpest edge in the console, so its
"state" is entirely in the audit trail:

```
  (not viewed) ──the view is used──▶ (viewed, and the row is written)
```

The audit row records the actor, the masked plate, the reason, and the request id. There is no
state to change and no data to mutate — which is exactly why it is safe to expose to a super
admin under two permissions.

### 4.3 The revenue figures are not a state

The revenue numbers are **derived** from the payment states, and they move when the payment
states move. The console never stores or caches a figure; it computes it from the source on every
request. There is therefore no "reporting state" to get out of sync with the operational state.

| The operational change | The revenue effect |
|---|---|
| A payment becomes `PAID` | The collected total rises |
| A payment becomes `VOIDED` | The collected total falls; the voided total rises |
| A payment becomes `EXEMPT` | The collected total does not rise; the exempt total (the leakage) rises |
| A session completes with no `PAID` payment | The uncollected-at-close total rises |
| A price policy changes | Nothing — the historical sessions keep their own fee snapshot |

## 5. Data model

No new tables. The console reads the operational tables through read-only query functions.

```prisma
model AuditLog {
  id          String   @id @default(uuid()) @db.Uuid
  siteId      String?  @db.Uuid
  actorUserId String?  @db.Uuid
  action      String
  entityType  String
  entityId    String?
  reason      String?
  metadataJson Json    @default("{}")
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  @@index([siteId, createdAt])
  @@index([actorUserId, createdAt])
  @@index([action, createdAt])
  @@index([createdAt])
}
```

The index on `createdAt` supports the bounded range queries; the composite indexes support the
per-site audit views.

## 6. Failure handling

| Failure | Response | Handling |
|---|---|---|
| The range exceeds the maximum | 400 `VALIDATION_FAILED` | The UI limits the picker to 366 days |
| The range is in the future | 400 `VALIDATION_FAILED` | — |
| A site filter includes a site the actor cannot see | 403 `AUTHZ_SCOPE_DENIED` | The platform scope covers all sites, so this only occurs for a non-super-admin |
| A query times out | 503 with `Retry-After` | The report is limited to 366 days and the indexes are in place |
| The export exceeds the maximum size | 400 with the limit stated | The actor must narrow the filter |
| A per-plate view without both permissions | 403 `AUTHZ_PERMISSION_DENIED` | Audited |
| The readable plate has been redacted | The per-plate view returns the aggregates without a plate | The redaction job clears `plate_id_normalized` after 90 days |

## 7. Security considerations

| Threat | Control |
|---|---|
| A plate list leaking from the console | No endpoint returns a plate list; the DTOs are aggregate-shaped |
| A digest being used to correlate a person | The digest never leaves the database; the pepper is a secret |
| Pepper rotation breaking the historical count | Documented in ADR-010; the console flags a "digest continuity broken" marker when the pepper's version changes |
| A super admin reading plates for surveillance | The per-plate view needs two permissions, is rate-limited, is audited, and is masked |
| An export being used to exfiltrate data | Bounded size, rate-limited, audited with the filter and the row count |
| The revenue figure being quietly inflated | `EXEMPT` and `VOIDED` are separate; the uncaptured warning is visible |
| An unbounded query being used as a DoS | The range is bounded; the queries are indexed; a timeout applies |
| A non-super-admin reaching a platform endpoint | `platform.*` permissions are not granted to any other role |

## 8. Observability

| Event | Where |
|---|---|
| `admin.revenue_viewed` | Audit log (actor, range) — sampled |
| `admin.plate_detail_viewed` | Audit log (actor, masked plate, reason) — **always** |
| `admin.audit_exported` | Audit log (actor, filter, row count, format) — **always** |
| `platform.owner_suspended` / `platform.user_suspended` / `platform.site_deactivated` | Audit log (actor, target, reason) |
| `admin_console_query_ms` | Histogram by report type |
| `revenue_discrepancy_detected` | Metrics — collected + exempt + voided ≠ the expected total for the period |

## 9. Alternatives considered

| Alternative | Why rejected |
|---|---|
| Counting `users` rows for adoption | Registration is optional; guests are the majority, so the number would be meaningless. |
| `COUNT(DISTINCT plate_id_normalized)` | Requires keeping readable plates indefinitely, and the console would have to handle the raw values. The digest is better. |
| Folding `EXEMPT` into revenue | Exemptions are revenue leakage. Hiding them inside a total is how leakage survives. |
| A separate BI database | The operational data is small at pilot scale; a replica adds failure modes. Revisit if the query latency becomes a problem. |
| Letting the super admin export raw plates | Plate data belongs to the motorcycle owner, not to the platform. |
| A real-time dashboard | A polled view is sufficient and much cheaper to build. |
| Caching the aggregates | The numbers are read rarely and change slowly; the query cost is acceptable without a cache. |
