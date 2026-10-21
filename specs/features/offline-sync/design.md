# Offline Sync — Design

**Status:** Deferred (Phase 6 target)
**Requirement IDs:** SYNC-001 … SYNC-012
**Design of record:** `specs/architecture/offline-architecture.md`

> Nothing in this document is implemented in the MVP. The `SyncModule` placeholder exists in the
> NestJS app so the module boundary is reserved, but it has no routes and no behaviour.

---

## 1. Architecture

```
   ONLINE                                    OFFLINE
┌──────────────┐                       ┌──────────────────────────┐
│ Central API  │◀── HTTPS ────────┐    │ Local parking service    │
│ + PostgreSQL │                  │    │  ┌────────────────────┐  │
└──────────────┘           ┌──────┴────┴──┐ Local API            │  │
                          │  Sync worker  │  ┌──────────────┐    │  │
                          │  (retry +     │  │ Local DB     │    │  │
                          │   backoff)    │  │  + outbox    │    │  │
                          └──────┬────────┘  └──────────────┘    │  │
                                 │             ┌──────────────┐    │  │
                                 └────────────▶│ Sync worker  │    │  │
                                               └──────────────┘    │  │
                                                                ───┘  │
   Guard monitor ──── HTTPS ──────────────────────────────►  local   │
                          (switched by the client on a failure)        │
```

## 2. Data model

```prisma
model SyncEvent {
  id                String   @id @default(uuid()) @db.Uuid
  siteId            String   @db.Uuid
  localAuthorityId  String
  eventId           String   @unique          // the deduplication key
  sequenceNumber    Int
  eventType         String
  payloadJson       Json
  schemaVersion     Int      @default(1)
  createdAtLocal    DateTime @db.Timestamptz(3)
  receivedAtCentral DateTime? @db.Timestamptz(3)
  syncStatus        SyncStatus @default(PENDING)
  conflictDetails   Json?
  rejectionCode     String?

  @@index([siteId, syncStatus])
  @@index([localAuthorityId, sequenceNumber])
  @@index([createdAtLocal])
}

enum SyncStatus { PENDING  DELIVERED  DUPLICATE  REJECTED  CONFLICT  FAILED }
```

The central side stores the events it has received (for the audit trail and for reconciliation).
The **local** side has an equivalent outbox table; the schemas mirror each other but the local one
is the source during an outage.

## 3. The event contract

```jsonc
{
  "eventId": "b1f4c8e2-…",          // globally unique (SYNC-001)
  "siteId": "…",
  "localAuthorityId": "site-S1-node-01",
  "entityRef": { "type": "parking_session", "id": "…" },
  "eventType": "session.completed",
  "createdAtLocal": "2026-10-21T09:12:44.120Z",
  "sequenceNumber": 1042,
  "payload": { /* the domain payload */ },
  "schemaVersion": 1,
  "integrity": { "alg": "HMAC-SHA256", "sig": "…" }
}
```

### 3.1 Event types

| Event type | Payload | Implied transition |
|---|---|---|
| `session.created` | `{ plateIdOriginal, plateIdNormalized, pricingPolicyId, pricingPolicyVersion }` | — → `PENDING_CLAIM` |
| `session.activated` | `{ entryAt, trigger }` | `PENDING_CLAIM` → `ACTIVE` |
| `session.cancelled` | `{ reason }` | `PENDING_CLAIM` → `CANCELLED` |
| `ticket.issued` | `{ ticketId, publicReference, tokenHash, issuedAt }` | — (a ticket for the session) |
| `payment.recorded` | `{ amountMinor, currency, method, status, reason }` | — |
| `session.completed` | `{ exitAt, feeAmountMinor, feeCurrency }` | `ACTIVE` → `COMPLETED` |
| `session.review_opened` | `{ reason, category }` | any → `MANUAL_REVIEW` |

Every event type maps to exactly one transition, and the central backend applies the **same**
transition table it uses online (`parking-session`). There is no second rules engine.

## 4. The central processing pipeline

```ts
// apps/api/src/modules/sync/sync.controller.ts
@Post('events')
@RequirePermissions('platform.sites.update')   // the local authority is a machine principal
async submit(@Body() batch: SyncEventBatchDto) {
  // 1. Authenticate the local authority (SYNC-002)
  const authority = await this.authorities.authenticate(batch.localAuthorityId, batch.integrity);
  if (!authority) throw new UnauthorizedException('SYNC_UNAUTHORIZED_AUTHORITY');

  const results = [];
  for (const event of batch.events) {
    // 2. Deduplicate (SYNC-003)
    const seen = await this.prisma.syncEvent.findUnique({ where: { eventId: event.eventId } });
    if (seen) { results.push({ eventId: event.eventId, status: 'duplicate' }); continue; }

    try {
      // 3–5. Validate the transition and apply it transactionally
      const applied = await this.applier.apply(event, authority);
      results.push({ eventId: event.eventId, status: applied.status, ...applied.details });
    } catch (e) {
      results.push({ eventId: event.eventId, status: 'rejected', code: e.code, details: e.details });
    }
  }
  return { results, serverTime: new Date().toISOString() };
}
```

### 4.1 The response envelope

```jsonc
{
  "results": [
    { "eventId": "…", "status": "accepted" },
    { "eventId": "…", "status": "duplicate" },
    { "eventId": "…", "status": "rejected", "code": "INVALID_TRANSITION",
      "details": { "from": "COMPLETED", "to": "PENDING_CLAIM" } },
    { "eventId": "…", "status": "conflict", "code": "CENTRAL_STATE_AHEAD",
      "details": { "centralStatus": "COMPLETED", "localStatus": "ACTIVE" } }
  ],
  "serverTime": "2026-10-21T09:12:44.120Z"
}
```

The HTTP status is `200` for a processed batch; the per-event status carries the outcome
(SYNC-006). A malformed batch is `400`; an unauthenticated authority is `401`.

### 4.2 The conflict rule

```ts
// The central state is authoritative UNLESS the local authority holds a declared outage.
if (central.status === event.impliedTarget && !outage.declared) {
  return { status: 'conflict', code: 'CENTRAL_STATE_AHEAD', details: { centralStatus, localStatus } };
}
```

**Central state is never silently overwritten** (SYNC-007). The event is stored with
`syncStatus = CONFLICT` and the details of both states, and it appears in the reconciliation
queue. A human resolves it.

During a **declared** outage, the local authority is authoritative for its site and the central
backend accepts the local transition. The outage declaration itself is a platform-level event
that the local authority reports.

## 5. Offline ticket verification (SYNC-011)

```
payload (v1):
{ "v":1, "tid":"…", "sid":"…", "site":"…", "iat":…, "exp":…, "plateDigest":"…", "kid":"key-2026-01" }
signature: Ed25519 over the canonical JSON
```

The local verifier checks:

1. the signature is valid under a known, non-revoked `kid`;
2. `exp` has not passed;
3. the local session state permits an exit.

The signature proves the issuer created the payload. It does **not** prove the ticket is unused —
that comes from step 3, against the local session state.

### 5.1 Key management

| Rule | Detail |
|---|---|
| Private keys | On the trusted local service / backend only |
| Distribution | Verification keys only |
| Key ids | Every payload carries a `kid` |
| Rotation | A new `kid`; the old key stays valid for verification until its `notAfter` |
| Update channel | Over the authenticated sync channel, out of band from the event stream |
| Emergency revocation | A local service can be told to stop accepting a `kid`; during a full disconnection it cannot learn of a revocation issued elsewhere |

## 6. State transitions

### 6.1 The sync event

```
   created locally ──▶ PENDING ──delivered──▶ DELIVERED
                          │  ▲                    │
              conflict   │  │ retry              │ re-submitted
                          ▼  │                    ▼
                     CONFLICT              DUPLICATE
                          │
                     rejected by the central backend
                          ▼
                      REJECTED
                          │
                     transport failure
                          ▼
                       FAILED ──retry──▶ PENDING
```

| From | Event | To | Effect |
|---|---|---|---|
| — | created | PENDING | Queued in the local outbox, in the same transaction as the state change |
| PENDING | accepted | DELIVERED | Removed from the local outbox |
| PENDING | duplicate | DUPLICATE | Removed from the local outbox; the effect already exists |
| PENDING | invalid transition | REJECTED | Retained and flagged for review |
| PENDING | state conflict | CONFLICT | Retained with both states' details |
| PENDING | transport failure | FAILED | Retried with exponential backoff |

### 6.2 The local authority's operating mode

```
  ONLINE ──the central backend is unreachable for N seconds──▶ DEGRADED
     ▲                                                            │
     │                                          the central API is reachable again
     └────────────────────────────────────────────────────────────┘
```

In `DEGRADED` mode the local service serves the guard and queues events. The mode is **not** a
global outage declaration; that is a separate platform-level action.

## 7. Failure handling

| Failure | Handling |
|---|---|
| The central backend is unreachable | The events stay in the outbox; the worker retries with exponential backoff and jitter |
| The local service is killed mid-transaction | The transaction rolls back; the outbox is written in the same transaction, so neither the state change nor the event is lost |
| The local service restarts with a backlog | The outbox is intact; the worker resumes; the backlog depth is reported |
| Events arrive out of order | The `sequenceNumber` detects the gap; the central backend applies a transition only if it is legal from the current state, and flags the rest |
| A duplicate event arrives | Deduplicated by `eventId` (SYNC-003, SYNC-008) |
| An event refers to an unknown entity | Rejected with `UNKNOWN_ENTITY`; it is not applied |
| The local clock is wrong | Ordering uses `sequenceNumber`, never the wall clock; `createdAtLocal` is informational |
| A second device claims to be the authority for a site | Rejected with `AUTHORITY_MISMATCH`; the site is configured with exactly one `localAuthorityId` |
| The integrity check fails | The whole batch is rejected with 401 |

## 8. Security considerations

| Threat | Control |
|---|---|
| A rogue device submitting events | The authority is authenticated per batch with an HMAC over the canonical body; the site has exactly one `localAuthorityId` |
| Event replay to double-apply | The `eventId` unique constraint (SYNC-003) |
| A stolen signing key | The keys live on trusted infrastructure only; the distribution is verification keys only |
| A forged signed ticket | The signature is verified against a known key id; the payload is minimal (no personal data) |
| Stale local state overwriting newer central state | The conflict rule (SYNC-007) |
| A ticket revoked centrally being used offline | **Not preventable while disconnected.** The limitation is stated in the UI and the runbook (SYNC-012). |
| An unbounded outbox | A maximum queue depth with an alert; the oldest events are never silently dropped — the site escalates to a human |
| The sync secret in a log | The logger redacts the signature and the secret |

## 9. Observability

| Event | Where |
|---|---|
| `sync.batch_received` | Metrics (event count, by outcome) |
| `sync.event_accepted` / `duplicate` / `rejected` / `conflict` | Metrics + the `sync_events` table |
| `sync.backlog_depth` | Gauge per site — the "is the site syncing?" signal |
| `sync.last_success_at` | Gauge per site |
| `sync.conflict_detected` | Metrics + an alert at a configurable threshold |
| `sync.mode_changed` | Audit log (online ↔ degraded) |

## 10. Alternatives considered

| Alternative | Why rejected |
|---|---|
| Letting the central backend accept and apply everything blindly | Silent data loss and double application. |
| Last-write-wins on conflicts | A stale local event would overwrite a newer central one. |
| Multiple offline authorities per site | Two devices could authorize the same ticket with no coordination. One authority per site is the recommendation (ADR-003). |
| A message queue (Redis / RabbitMQ) | Adds an operational dependency to the pilot's simplest architecture. The HTTP batch endpoint with a durable outbox is enough at this scale. |
| Reusing the online ticket format offline | The online token requires a server lookup. Offline verification needs a self-contained signed payload. |
| Claiming global revocation while disconnected | It is impossible, and claiming it would be a false security promise. |
