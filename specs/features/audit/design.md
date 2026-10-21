# Audit Log — Design

**Status:** In progress
**Requirement IDs:** AUDIT-001 … AUDIT-014

---

## 1. Architecture

```
Domain service (inside a transaction)
        │
        ├─ 1. INSERT/UPDATE the domain row
        │
        ├─ 2. AuditService.write({ action, entityType, entityId, siteId, reason, metadata })
        │        └─ INSERT INTO audit_logs (...)
        │
        └─ 3. COMMIT          ← both rows commit together (AUDIT-002)

RequestIdInterceptor
        └─ request.requestId ──▶ every audit row carries it (AUDIT-014)
```

**The audit write is not an interceptor that runs after the fact.** An after-the-fact write can
miss a rolled-back transaction and can survive one that should not have happened. The audit row is
part of the same unit of work.

## 2. Data model

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
  requestId   String?
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  @@index([siteId, createdAt])
  @@index([actorUserId, createdAt])
  @@index([action, createdAt])
  @@index([entityType, entityId])
  @@index([createdAt])
}

enum AuditAction {
  AUTH_LOGIN            = 'auth.login'
  AUTH_LOGIN_FAILED     = 'auth.login_failed'
  AUTH_LOGOUT           = 'auth.logout'
  AUTH_TOKEN_REUSE      = 'auth.token_reuse_detected'
  AUTHZ_PERMISSION_DENIED = 'authz.permission_denied'
  AUTHZ_SCOPE_DENIED    = 'authz.scope_denied'
  AUTHZ_GRANT_CREATED   = 'authz.grant_created'
  AUTHZ_GRANT_REVOKED   = 'authz.grant_revoked'
  AUTHZ_ASSIGNMENT_CHANGED = 'authz.assignment_changed'
  SITE_CREATED          = 'site.created'
  SITE_SETTINGS_UPDATED = 'site.settings.updated'
  SITE_DEACTIVATED      = 'site.deactivated'
  SITE_REACTIVATED      = 'site.reactivated'
  OWNER_STAFF_INVITED   = 'owner.staff_invited'
  OWNER_STAFF_DEACTIVATED = 'owner.staff_deactivated'
  PRICING_POLICY_CREATED = 'pricing.policy_created'
  SESSION_CREATED       = 'session.created'
  SESSION_ACTIVATED     = 'session.activated'
  SESSION_CANCELLED     = 'session.cancelled'
  SESSION_TRANSITIONED  = 'session.transitioned'
  ENTRY_CLAIM_ISSUED    = 'entry_claim.issued'
  ENTRY_CLAIM_CLAIMED   = 'entry_claim.claimed'
  ENTRY_CLAIM_REISSUED  = 'entry_claim.reissued'
  ENTRY_CLAIM_REVOKED   = 'entry_claim.revoked'
  TICKET_ISSUED         = 'ticket.issued'
  TICKET_REVOKED        = 'ticket.revoked'
  TICKET_LINKED         = 'ticket.linked'
  TICKET_LINK_FAILED    = 'ticket.link_failed'
  EXIT_VERIFIED         = 'exit.verified'
  EXIT_REQUESTED        = 'exit.requested'
  EXIT_COMPLETED        = 'exit.completed'
  EXIT_ABORTED          = 'exit.aborted'
  EXIT_REFUSED          = 'exit.refused'
  PAYMENT_RECORDED      = 'payment.recorded'
  PAYMENT_VOIDED        = 'payment.voided'
  PAYMENT_EXEMPTED      = 'payment.exempted'
  REVIEW_OPENED         = 'review.opened'
  REVIEW_RESOLVED       = 'review.resolved'
  ADMIN_PLATE_VIEWED    = 'admin.plate_detail_viewed'
  ADMIN_AUDIT_EXPORTED  = 'admin.audit_exported'
  PLATFORM_OWNER_SUSPENDED = 'platform.owner_suspended'
  PLATFORM_USER_SUSPENDED  = 'platform.user_suspended'
  PLATFORM_SITE_DEACTIVATED = 'platform.site_deactivated'
  SYNC_CONFLICT_DETECTED = 'sync.conflict_detected'
}
```

The `AuditAction` enum is the **single source of truth** for the action names. A typo is a compile
error, and the catalogue in the feature spec mirrors it.

### 2.1 Metadata

The metadata is a small, explicit object — never an arbitrary dump:

```jsonc
// session.created
{ "plateDigest": "9f2c…", "channel": "web" }

// payment.voided
{ "paymentId": "…", "originalAmountMinor": 150, "originalStatus": "PAID" }

// exit.completed
{ "feeAmountMinor": 150, "feeCurrency": "USD", "durationMinutes": 92, "channel": "web" }
```

**Never** in the metadata: a raw token, a password, a cookie, an authorization header, a readable
plate (except in the explicitly plate-scoped actions), or the plate pepper (AUDIT-008, AUDIT-009).

## 3. Writing an audit row

```ts
// apps/api/src/modules/audit/audit.service.ts
@Injectable()
export class AuditService {
  // Called INSIDE the caller's transaction: the caller passes its own client.
  async write(
    tx: Prisma.TransactionClient,
    entry: {
      action: AuditAction;
      entityType: string;
      entityId?: string;
      siteId?: string;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
    actor?: ActorContext,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        siteId: entry.siteId,
        reason: entry.reason,
        metadataJson: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        actorUserId: actor?.userId,
        requestId: actor?.requestId,
        createdAt: new Date(),   // the server clock
      },
    });
  }
}
```

**The transaction client is passed in.** This is the mechanism that enforces AUDIT-002: the service
cannot accidentally write outside the caller's transaction.

### 3.1 Denials

A denial happens *before* a transaction exists, so the denial audit is written on the main client:

```ts
// In PermissionGuard, after producing the 403
await this.audit.writeOnMain({
  action: 'authz.permission_denied',
  entityType: 'http_request',
  entityId: `${req.method} ${req.route.path}`,
  siteId: targetSiteId ?? undefined,
  metadata: { requiredPermissions, actorRole: actor.role, scopeKind: actor.scopeKind },
}, actor);
```

Denied-request rows are **rate-limited** per actor so that a probing attacker cannot flood the
table (and therefore the disk).

## 4. Reading and export

### 4.1 The read query

```sql
SELECT * FROM audit_logs
WHERE (:siteId IS NULL OR site_id = :siteId)
  AND (:actorUserId IS NULL OR actor_user_id = :actorUserId)
  AND (:action IS NULL OR action = :action)
  AND (:entityType IS NULL OR entity_type = :entityType)
  AND (:entityId IS NULL OR entity_id = :entityId)
  AND created_at >= :from AND created_at < :to
  AND site_id = ANY(:inScopeSiteIds)      -- the scope is applied in the query
ORDER BY created_at DESC, id DESC
LIMIT :limit;
```

**The scope is applied in the query**, not in memory. An in-memory filter over a broad fetch is a
classic leak: the row count and the timing both disclose.

### 4.2 The export

* Bounded to **100 000 rows** (AUDIT-007).
* Rate-limited: 1 export per minute per actor.
* Streamed as CSV or NDJSON, so a large export does not have to be held in memory.
* The export action is audited with the actor, the filter, the row count, and the format.
* The export is delivered as a signed, short-lived download link (or streamed directly) — never
  written to a publicly readable location.

## 5. Failure handling

| Failure | Behaviour |
|---|---|
| The audit insert fails inside a business transaction | The transaction rolls back. The business operation **does not happen** (AUDIT-013). A missing audit row is worse than a failed operation. |
| The audit insert fails for a denial (no transaction) | The denial still returns 403; the failure is logged and counted in a metric |
| The audit table is full | The business transaction fails — this is an operational alert, not something to swallow |
| The clock is wrong | The server clock is the only source; a drift alert fires when it differs from the database clock by more than a minute |
| A metadata value is not serializable | The write is rejected (a programming error, caught in development) |
| The export is too large | Rejected with 400 and the limit stated; the attempt is audited |
| The actor is `null` (a system action) | `actorUserId` is null and the metadata records the system context |

## 6. Security considerations

| Threat | Control |
|---|---|
| A guard deleting an audit row | No update or delete operation exists (AUDIT-004); a super admin's destructive access is impossible by construction |
| A guard editing an audit row to hide an override | The same — the table is append-only |
| An audit row leaking a token | The metadata is an explicit, allow-listed shape; a unit test asserts the forbidden keys are absent |
| An owner reading another owner's audit | The scope is applied in the query (AUDIT-005) |
| A huge export filling the disk | The bound, the rate limit, and the stream |
| A denial flood filling the table | The denial audit is rate-limited per actor |
| A user forging an actor id | `actorUserId` comes from the authenticated actor context, never from the request |
| A log entry containing personal data | The plate digest is used instead of the plate; the readable plate is only present in explicitly plate-scoped actions |
| An auditor reading the log changing the log | The super admin can *export* but not *modify* |

## 7. Observability

The audit log **is** the observability system for business events. The application metrics cover
the technical side:

| Signal | Purpose |
|---|---|
| `audit_write_failed_total` | The audit subsystem is broken — page |
| `audit_denied_written_total` | The denial path is working |
| `audit_rows_total{action}` | Volume by action |
| `audit_clock_drift_seconds` | The server clock versus the database clock |

## 8. Alternatives considered

| Alternative | Why rejected |
|---|---|
| An interceptor that writes the audit after the response | It misses rolled-back transactions and can log changes that never happened. |
| An event bus (Kafka / NATS) | Adds an operational dependency and a delivery guarantee problem for a pilot. The transactional outbox pattern is enough — and here the outbox *is* the transaction. |
| Storing the audit in the same table as the entity | Different lifecycles, different retention, different access patterns. |
| Making the audit log editable by a super admin | The log's value is that it cannot be edited. Corrections are new rows. |
| Logging the readable plate in every row | Unnecessary personal data. The digest identifies the bike for counting without exposing it. |
| An unbounded export | A single request could dump the whole history. |
| Hash-chaining the rows for tamper evidence | A nice property, but the table is append-only by API design and the DB role has no UPDATE grant. Revisit if a compliance requirement appears. |
