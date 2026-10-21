# Parking Session — Design

**Status:** In progress
**Requirement IDs:** SESSION-001 … SESSION-014

---

## 1. Architecture

```
apps/web (guard dashboard)              apps/api
────────────────────────               ──────────────────────────────────────────────
Plate input                            ParkingSessionsController
  POST /parking-sites/:siteId/sessions ▶  @RequirePermissions('site.sessions.create')
        │                                    └─ ScopeResolver(siteId)
        │                                    └─ ParkingSitesService.assertActive(siteId)
        │                                    └─ PlateNormalizer.normalize(raw)
        │                                    └─ BEGIN TX
        │                                       INSERT parking_sessions (PENDING_CLAIM)
        │                                       INSERT entry_claims (token hash, expires_at)
        │                                       INSERT audit_logs (session.created)
        │                                    └─ COMMIT
        │                                    └─ EntryClaimsService returns the RAW token once
        ▼
Entry QR rendered from the raw claim token
```

The controller is thin. All domain rules live in `ParkingSessionsService`, which is the only place
that knows the state machine.

## 2. Data model

```prisma
model ParkingSession {
  id                 String   @id @default(uuid()) @db.Uuid
  siteId             String   @db.Uuid
  plateIdOriginal    String
  plateIdNormalized  String
  plateDigest        String?
  guestUserId        String?  @db.Uuid
  status             SessionStatus @default(PENDING_CLAIM)
  entryAt            DateTime? @db.Timestamptz(3)
  exitAt             DateTime? @db.Timestamptz(3)
  pricingPolicyId    String?  @db.Uuid
  pricingPolicyVersion Int?
  feeAmountMinor     Int?
  feeCurrency        String?
  createdByGuardId   String?  @db.Uuid
  completedByGuardId String?  @db.Uuid
  rowVersion         Int      @default(1)
  createdAt          DateTime @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime @updatedAt @db.Timestamptz(3)

  site             ParkingSite @relation(fields: [siteId], references: [id])
  entryClaims      EntryClaim[]
  ticket           Ticket?
  payments         Payment[]
  pricingPolicy    PricingPolicy? @relation(fields: [pricingPolicyId], references: [id])
  reviewCases      ReviewCase[]

  @@index([siteId, status])
  @@index([siteId, createdAt])
  @@index([plateDigest])
  @@index([plateIdNormalized])
}

enum SessionStatus {
  PENDING_CLAIM
  ACTIVE
  EXIT_PENDING
  COMPLETED
  CANCELLED
  MANUAL_REVIEW
}
```

### 2.1 `rowVersion`

An optimistic-locking counter. Every state-changing write includes
`WHERE id = ? AND row_version = ?` and increments it. A zero-row update means a concurrent
modification won, and the service retries or returns a conflict. This is the second line of defence
behind the `FOR UPDATE` row lock used during exit completion.

### 2.2 Index rationale

| Index | Serves |
|---|---|
| `(site_id, status)` | The guard dashboard's "active sessions at my site" list |
| `(site_id, created_at)` | The site session list and the date-range report |
| `(plate_digest)` | The admin adoption query: `count(distinct plate_digest)` |
| `(plate_id_normalized, site_id)` | The duplicate-active-session check at a site |

## 3. State transitions

```
                    ┌──────────────┐
                    │ PENDING_CLAIM│
                    └──┬────┬───┬──┘
        claim / manual  │    │   │  cancel
        activation      │    │   └──────────────────▶ ┌───────────┐
                       │    │                       │ CANCELLED │ (terminal)
                       │    └── open review ───▶ ┌────────────────┐
                       ▼                         │ MANUAL_REVIEW │
                  ┌────────┐                     └─┬──────┬──────┬┘
                  │ ACTIVE │      open review       │      │      │
                  └───┬────┘ ──────────────────────▶│      │      │
                      │                            │      │      │
       exit requested │                            │ authorized  authorized
                      ▼                            │ resolution │
              ┌──────────────┐                    │      │      │
              │ EXIT_PENDING │◀───────────────────┘      │      │
              └───┬──────┬───┘        authorized        │      │
       complete    │      │  abort (safe)               │      │
                  │      └──────────────────┐            │      │
                  ▼                         ▼            │      │
            ┌───────────┐             ┌────────┐       │      │
            │ COMPLETED │ (terminal)  │ ACTIVE │◀──────┘      │
            └───────────┘             └────────┘              │
                  │                                        │
                  │        authorized resolution           │
                  └────────────────────────────────────────┴──▶ COMPLETED
```

### 3.1 Transition table

| From | To | Trigger | Preconditions | Actor |
|---|---|---|---|---|
| — | `PENDING_CLAIM` | session created | site active, plate policy satisfied | guard (assigned) |
| `PENDING_CLAIM` | `ACTIVE` | entry claim succeeds | claim valid, session still `PENDING_CLAIM` | guest or system |
| `PENDING_CLAIM` | `ACTIVE` | manual activation | never claimed | guard (assigned) |
| `PENDING_CLAIM` | `CANCELLED` | cancel | never claimed | guard (assigned) |
| `PENDING_CLAIM` | `MANUAL_REVIEW` | open review | — | guard / owner |
| `ACTIVE` | `EXIT_PENDING` | exit requested | ticket verified, plate checked | guard (assigned) |
| `ACTIVE` | `MANUAL_REVIEW` | open review | — | guard / owner |
| `EXIT_PENDING` | `COMPLETED` | exit completed | payment requirement satisfied, ticket valid | guard (assigned) |
| `EXIT_PENDING` | `ACTIVE` | exit aborted | — | guard (assigned) |
| `EXIT_PENDING` | `MANUAL_REVIEW` | open review | — | guard / owner |
| `MANUAL_REVIEW` | `ACTIVE` | resolution | audited reason | owner / super admin (guard with reason) |
| `MANUAL_REVIEW` | `EXIT_PENDING` | resolution | audited reason | owner / super admin |
| `MANUAL_REVIEW` | `COMPLETED` | resolution | audited reason, payment requirement satisfied | owner / super admin |

### 3.2 The transition engine

```ts
// apps/api/src/modules/parking-sessions/session-state-machine.ts
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  PENDING_CLAIM: ['ACTIVE', 'CANCELLED', 'MANUAL_REVIEW'],
  ACTIVE:        ['EXIT_PENDING', 'MANUAL_REVIEW'],
  EXIT_PENDING:  ['COMPLETED', 'ACTIVE', 'MANUAL_REVIEW'],
  COMPLETED:     [],
  CANCELLED:     [],
  MANUAL_REVIEW: ['ACTIVE', 'EXIT_PENDING', 'COMPLETED'],
};

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError('SESSION_INVALID_TRANSITION', 409, { from, to });
  }
}
```

The engine is a pure function with no database access, so the transition table is exhaustively
unit-testable. Every service that changes a status calls it first, inside the transaction.

### 3.3 The fee clock

```
  create            claim / manual activation        exit complete
     │                        │                             │
     ▼                        ▼                             ▼
  PENDING_CLAIM ────────────> ACTIVE ─────────────────────> COMPLETED
  entry_at = null             entry_at = now()             exit_at = now()
                              ▲                             │
                              └─────────────────────────────┘
                            fee window = [entry_at, exit_at]
```

**The fee window starts at activation, not at creation.** A session that is never claimed is
cancelled or left pending and is never charged. `entry_at` is stored in UTC; the duration is
displayed in the site's timezone.

## 4. Failure handling

| Failure | Response | Handling |
|---|---|---|
| Illegal transition | 409 `SESSION_INVALID_TRANSITION` | The body includes `from` and `to`; the service returns the current state so the UI can refresh |
| Optimistic-lock conflict | 409 `SESSION_CONFLICT` | The client refreshes and retries |
| Duplicate active session for the plate | 409 `PARK_DUPLICATE_ACTIVE_SESSION` | Details include the existing session id and its entry time |
| Site deactivated | 409 `PARK_SITE_DEACTIVATED` | — |
| DB failure mid-transaction | 500 `INTERNAL_ERROR` | The transaction rolls back; no partial session exists |
| Concurrent activation | One succeeds, the other sees `SESSION_INVALID_TRANSITION` | The claim endpoint handles this idempotently (see `entry-qr-claim`) |
| Audit write failure | The transaction rolls back | The audit log is part of the same transaction; a session without its audit row is a bug |

**A failure never silently changes a session's state.** The client always receives an explicit
error code and the current state where it is safe to include it.

## 5. Security considerations

| Threat | Control |
|---|---|
| Client supplies a status or a timestamp | The DTO schema is `.strict()`; those fields are rejected with 400 |
| Guard creates a session at another site | The scope check on `siteId` |
| Forged entry time (to shorten a stay) | The server clock is the only source of `entry_at` / `exit_at` |
| Plate enumeration through the session list | The list is scoped; `plate_id_normalized` is only returned to actors with `site.sessions.read` in scope |
| Plate data in logs | The logger redacts the plate; only the digest is logged |
| Reopening a completed session | The state machine has no outgoing edge from `COMPLETED`; `row_version` protects against a concurrent write |
| Cross-site ticket use | The ticket's session is resolved, and the session's site is scope-checked, during verification |
| The pepper leaking | `PLATE_PEPPER` is an environment secret, never in Git, never returned by any endpoint |

## 6. Observability

| Event | Where |
|---|---|
| `session.created` | Audit log (site, guard, plate digest — **not** the plate) |
| `session.activated` | Audit log (actor, trigger: `claim` \| `manual`) |
| `session.cancelled` | Audit log (actor, reason) |
| `session.transitioned` | Audit log for every state change, with `from` and `to` |
| `session.review_opened` / `session.review_resolved` | Audit log (actor, reason) |
| `sessions_created_total{site}` | Metrics |
| `sessions_pending_claim_age` | Gauge (a rising gauge means claims are failing) |
| `SESSION_INVALID_TRANSITION` | Metrics counter — a spike indicates a client bug |

## 7. Alternatives considered

| Alternative | Why rejected |
|---|---|
| The fee clock starts at plate entry | A session that is never claimed would still be charged. ADR-004 settles activation on claim. |
| The guard confirms the motorcycle physically entered | Adds a step for every entry and was explicitly decided against. |
| A free-form `status` string field | No enforcement; invalid states become representable. A closed enum plus a transition table makes illegal states unrepresentable and testable. |
| The client supplies `entryAt` | Client clocks are wrong, and a client could shorten a stay. |
| `SELECT … FOR UPDATE` only, no `row_version` | Row locks do not protect against a non-locking writer. The optimistic counter catches that. |
| A global unique index on the plate | A bike may park at two sites at once. The constraint belongs at the site level (PARK-008). |
