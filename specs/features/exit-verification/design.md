# Exit Verification — Design

**Status:** In progress
**Requirement IDs:** EXIT-001 … EXIT-016

---

## 1. Architecture

```
Guard dashboard                          apps/api
─────────────────                       ───────────────────────────────────────────────
Scan QR ──► ticket token                 VerificationController.verify
Type ref ──► public reference           @RequirePermissions('site.ticket.verify')
        │                                     │
        └────────── POST /verification/exit ──▶ VerificationService.verify()
                                                ├─ resolve the ticket (token hash | reference)
                                                ├─ load the LIVE session + site + policy
                                                ├─ compute the verdict
                                                └─ return { verdict, facts }
                                                       │
                                                       ▼
                                       guard reads the facts, checks the physical plate,
                                       records the payment, presses "Authorize Exit"
                                                       │
Authorize Exit ── POST /parking-sessions/:id/exit/complete ──▶ ParkingSessionsService.completeExit()
                                                │ BEGIN TX
                                                │  SELECT session … FOR UPDATE
                                                │  re-check status / ticket / payment
                                                │  UPDATE session → COMPLETED, exit_at, fee snapshot
                                                │  INSERT audit_logs
                                                │ COMMIT
```

**Two round trips, deliberately.** The first is read-only and changes nothing. The second is the
committed transition. The guard must be able to see the facts, check the plate, and take the money
before anything is written.

## 2. Data model

No new tables are strictly required, but two are added for the review workflow and one column is
added to the session.

```prisma
model ReviewCase {
  id           String   @id @default(uuid()) @db.Uuid
  sessionId    String   @db.Uuid
  siteId       String   @db.Uuid
  reason       String
  category     ReviewCategory
  status       ReviewStatus @default(OPEN)
  openedById   String   @db.Uuid
  openedAt     DateTime @default(now()) @db.Timestamptz(3)
  resolvedById String?  @db.Uuid
  resolvedAt   DateTime? @db.Timestamptz(3)
  resolution   String?
  resolvedTo   SessionStatus?
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @db.Timestamptz(3)

  session      ParkingSession @relation(fields: [sessionId], references: [id])

  @@index([siteId, status])
  @@index([sessionId])
}

enum ReviewCategory { PLATE_MISMATCH  TICKET_DISPUTE  PAYMENT_DISPUTE  LOST_TICKET  OTHER }
enum ReviewStatus  { OPEN  RESOLVED }
```

The `parking_sessions` model gains nothing new beyond the fee snapshot already specified in
`parking-session` (SESSION-014).

## 3. The verification algorithm

```ts
// apps/api/src/modules/verification/verification.service.ts
async verify(input: { token?: string; reference?: string; observedPlate?: string }, actor): Promise<VerificationResult> {
  const ticket = await this.resolveTicket(input);          // by token hash or by reference
  if (!ticket) return { verdict: 'UNKNOWN' };

  const session = await this.prisma.parkingSession.findUnique({
    where: { id: ticket.sessionId },
    include: { ticket: true, payments: true, site: true },
  });
  if (!session) return { verdict: 'UNKNOWN' };

  // 1. Ticket-level checks
  if (ticket.status === 'REVOKED') return { verdict: 'REVOKED', ... };
  if (ticket.status === 'EXPIRED') return { verdict: 'EXPIRED', ... };

  // 2. Session-level checks
  if (session.status === 'COMPLETED') return { verdict: 'ALREADY_COMPLETED', ... };
  if (session.status === 'CANCELLED') return { verdict: 'NOT_ACTIVE', ... };
  if (session.status === 'MANUAL_REVIEW') return { verdict: 'MANUAL_REVIEW_REQUIRED', ... };
  if (session.status === 'PENDING_CLAIM') return { verdict: 'NOT_ACTIVE', ... };

  // 3. Facts (always computed, so the guard sees the truth even on a refusal)
  const fee = this.pricing.calculate(session, session.site, now);
  const facts = { plateId, siteName, entryAt, durationMinutes, fee, pricingPolicyVersion, paymentStatus, sessionStatus, ticketStatus };

  // 4. Payment requirement
  if (!this.payments.isSatisfied(session, fee)) return { verdict: 'PAYMENT_PENDING', ...facts };

  // 5. Physical plate check (only when the guard supplied the observed plate)
  if (input.observedPlate && normalize(input.observedPlate) !== session.plateIdNormalized) {
    return { verdict: 'PLATE_MISMATCH', ...facts, expectedPlate: session.plateIdNormalized };
  }

  return { verdict: 'VALID', ...facts };
}
```

### 3.1 The verdict precedence

The order above is deliberate. A ticket that is revoked is reported as `REVOKED` even if the
session is also completed — the *ticket* is the thing the guard presented, and the most specific
reason is the most useful one. The precedence is fixed and unit-tested:

```
REVOKED > EXPIRED > ALREADY_COMPLETED > NOT_ACTIVE > MANUAL_REVIEW_REQUIRED
        > PLATE_MISMATCH > PAYMENT_PENDING > VALID
```

**Facts are computed before the payment and plate checks** so that a `PAYMENT_PENDING` or
`PLATE_MISMATCH` verdict still shows the guard everything they need. Only `UNKNOWN`, `REVOKED`,
`EXPIRED`, `ALREADY_COMPLETED`, `MANUAL_REVIEW_REQUIRED`, and `NOT_ACTIVE` withhold the facts.

### 3.2 Payment satisfaction

| Payment status | Satisfies the requirement? |
|---|---|
| `PAID` (and the amount ≥ the fee) | Yes |
| `EXEMPT` | Yes (the exemption is itself audited) |
| `UNPAID` | No |
| `PENDING` | No |
| `FAILED` | No |
| `VOIDED` | No — a voided payment does not settle anything |

The site's policy may mark the fee as **not required** (a free site, or a zero-amount policy); then
any payment state satisfies the requirement, because the amount owed is zero.

## 4. The completion transaction

```sql
BEGIN;

-- 1. Lock the session
SELECT * FROM parking_sessions WHERE id = $sessionId FOR UPDATE;

-- 2. Re-check the invariants (never trust the earlier verification)
--    status must be ACTIVE or EXIT_PENDING
--    the ticket must be ISSUED and its session must match
--    the payment requirement must be satisfied

-- 3. Write the fee snapshot
UPDATE parking_sessions
SET status           = 'COMPLETED',
    exit_at          = now(),
    completed_by_guard_id = $guardId,
    fee_amount_minor = $feeMinor,
    fee_currency     = $currency,
    row_version      = row_version + 1
WHERE id = $sessionId AND row_version = $rowVersion;

-- 4. Mark the ticket as spent
UPDATE tickets SET status = 'ISSUED' WHERE id = $ticketId;   -- the row stays; the session state makes it spent

-- 5. Audit
INSERT INTO audit_logs (site_id, actor_user_id, action, entity_type, entity_id, metadata_json)
VALUES ($siteId, $actorId, 'exit.completed', 'parking_session', $sessionId, $metadata);

COMMIT;
```

**Why the re-check inside the transaction.** Between the verification and the completion, another
guard could have completed the session, or a payment could have been voided. The completion
re-derives the truth under a lock. The earlier verification is a *display*, never a decision.

### 4.1 Concurrency

Two guards press Authorize Exit at the same time:

* Guard A acquires the row lock, re-checks, writes, commits.
* Guard B blocks on the lock, then reads the updated row. The status is `COMPLETED`, so the
  re-check fails and B receives `409 EXIT_ALREADY_COMPLETED`.

The `row_version` guard is a second line of defence for a writer that does not take the lock.

## 5. State transitions at the exit

```
   ACTIVE ──exit requested──▶ EXIT_PENDING ──complete──▶ COMPLETED (terminal)
      │                            │
      │                            └──abort (safe)──▶ ACTIVE
      │
      └──open review──▶ MANUAL_REVIEW ──resolve──▶ ACTIVE | EXIT_PENDING | COMPLETED
```

| From | To | Trigger | Preconditions | Actor |
|---|---|---|---|---|
| `ACTIVE` | `EXIT_PENDING` | The guard requests the exit | The verdict is `VALID` or `PAYMENT_PENDING` | guard |
| `EXIT_PENDING` | `COMPLETED` | Authorize Exit | Re-checks pass under a lock | guard |
| `EXIT_PENDING` | `ACTIVE` | The exit is aborted (e.g. the owner disputes the fee) | — | guard |
| `ACTIVE` / `EXIT_PENDING` / `PENDING_CLAIM` | `MANUAL_REVIEW` | A review case is opened | A reason | guard / owner |
| `MANUAL_REVIEW` | `ACTIVE` / `EXIT_PENDING` / `COMPLETED` | A review is resolved | A reason; the payment requirement is satisfied for `COMPLETED` | owner / super admin (a guard with a reason) |

**Why `EXIT_PENDING` exists.** It marks the moment the guard has committed to the exit, so a second
guard at the same site sees that the exit is in progress rather than opening a parallel flow. It
is also the state from which a safe abort returns the motorcycle to a normal active session.

## 6. Failure handling

| Failure | Response | Handling |
|---|---|---|
| Unknown ticket or reference | 200 with the verdict `UNKNOWN` | A 404 would leak the difference between "wrong reference" and "no such ticket" |
| Revoked ticket | 200 with `REVOKED` | The UI offers "open a manual review" |
| Session already completed | 200 with `ALREADY_COMPLETED` | The UI shows the exit time |
| Payment not settled | 200 with `PAYMENT_PENDING` | The UI shows the amount due and the payment controls |
| Plate mismatch | 200 with `PLATE_MISMATCH` | The UI shows the expected plate prominently and blocks Authorize Exit |
| Completion finds a changed state | 409 `EXIT_ALREADY_COMPLETED` / `EXIT_PAYMENT_REQUIRED` / `SESSION_INVALID_TRANSITION` | The UI refreshes the verification facts |
| Concurrent completion | 409 `EXIT_ALREADY_COMPLETED` | Exactly one audit row for a completion |
| The session row is locked for a long time | 503 with `Retry-After` | The lock timeout is short (5 s) |

## 7. Security considerations

| Threat | Control |
|---|---|
| A stolen ticket is used to steal a motorcycle | The guard must physically compare the plate; the mismatch is a first-class verdict that blocks the exit |
| A screenshot of a live ticket is used after the owner left | The live session state is checked; a completed session cannot complete again |
| Forging a verdict | The client cannot influence the verdict; the completion re-derives it server-side |
| Completing an exit for another site | The scope check resolves the session's site |
| Double-spending a ticket (two motorcycles) | The transactional completion plus the unique completion invariant |
| A guard marking a payment as paid without evidence | `site.payments.record` requires a method and a reason; the payment workflow is separate from the exit |
| Overriding a refusal silently | A refusal cannot be overridden; the only path is a manual review with an audited reason and an authorized actor |
| Brute-forcing a public reference | 60 verification attempts per guard per minute; the reference space is ~40 bits; a reference alone does not complete an exit |
| Leaking session details on an unknown ticket | The `UNKNOWN` verdict returns no facts |

## 8. Observability

| Event | Where |
|---|---|
| `exit.verified` | Audit log (actor, reference, verdict) — one per attempt |
| `exit.requested` | Audit log (actor, session) |
| `exit.completed` | Audit log (actor, session, fee, duration) |
| `exit.aborted` | Audit log (actor, reason) |
| `exit.refused` | Audit log (actor, reference, verdict) |
| `review.opened` / `review.resolved` | Audit log (actor, reason, before/after) |
| `exit_verdict_total{verdict}` | Metrics — a rising `PLATE_MISMATCH` is a red flag |
| `exit_duration_seconds` | Histogram |
| `exit_completion_conflict_total` | Metrics — concurrent completion attempts |

## 9. Alternatives considered

| Alternative | Why rejected |
|---|---|
| A single "check and exit" endpoint | The guard must see the facts and take the payment before anything is committed. Splitting verification from completion is what makes that possible. |
| The client deciding the verdict | The client is untrusted; a modified browser would authorize any exit. |
| Trusting the earlier verification inside the completion | The state may change between the two calls. The re-check under a lock is the whole point. |
| A boolean `authorized` flag on the ticket | A flag becomes stale the moment it is written. |
| Letting a guard complete an exit by plate search alone | Removes the ticket check entirely. A manual review is required, and it is audited. |
| Soft-deleting a disputed session | The audit trail must survive. Disputes go to `MANUAL_REVIEW` with a case record. |
| A "grace period" where the fee is zero | Deferring the decision to the site policy is more flexible than hardcoding it. |
