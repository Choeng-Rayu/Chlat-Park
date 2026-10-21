# Exit Verification

**Status:** In progress
**Requirement IDs:** EXIT-001 … EXIT-016
**Depends on:** `guest-ticket`, `parking-session`, `pricing-and-payment`

---

## 1. Problem

The exit is where money changes hands and where a motorcycle leaves the lot. Two failure modes
matter, and they pull in opposite directions:

* **Too permissive** — an invalid, expired, revoked, already-used, or wrong-plate ticket is
  accepted, and a motorcycle leaves without a motorcycle owner leaving. The lot loses revenue and
  loses control of its inventory.
* **Too strict** — a legitimate owner is stuck at the gate because the system was strict about the
  wrong thing, and the guard has to improvise. Improvisation is how unguarded exits happen.

The resolution is to separate **verification** from **decision**, and to make the decision
transactional:

1. **Verification** answers *"what does the system know about this ticket right now?"* It returns
   a status and the facts. It never authorizes anything.
2. **The guard** checks the physical plate against the displayed plate, collects payment, and
   presses **Authorize Exit**.
3. **Completion** is a single transactional operation that re-checks everything under a row lock
   and either completes the exit or refuses with a specific reason.

The system must **never silently authorize an exit**. Every refusal has a named status, and every
refusal has a defined next step — including "open a manual review".

## 2. Scope

### 2.1 In scope

* Scanning the ticket QR or entering the ticket reference.
* The verification result: the ticket status, the session status, the plate, the site, the entry
  time, the duration, the fee preview with the pricing-policy version, and the payment state.
* The verification status vocabulary.
* Plate mismatch detection.
* The `EXIT_PENDING` transition and the transactional exit completion.
* Payment requirement enforcement (per the site's policy).
* Concurrent exit attempts — exactly one completion.
* Manual review: opening a case and resolving it with an audited reason.
* Audit records for every verification, refusal, and completion.
* Recovery: searching for an active session by plate at the site (a guard-side fallback).

### 2.2 Out of scope

* Barrier or gate automation (out of scope, L6).
* Camera / ANPR plate reading (out of scope, L6).
* Refunds and partial payments.
* The fee calculation itself (`pricing-and-payment`).
* Offline verification (deferred).

## 3. Actors

| Actor | Interaction |
|---|---|
| Security guard | Scans or types a ticket, reviews the facts, records payment, authorizes the exit, opens a review case |
| Parking owner | Resolves a manual review case, grants an exemption |
| Platform administrator | Investigates and audits |
| Guest / registered owner | Presents the ticket |

## 4. Behaviour

### 4.1 Verification

1. The guard scans the ticket QR, or types the public reference.
2. The system resolves the ticket, then loads the **live** session and the site's pricing policy.
3. The system returns a status and the facts:

   | Field | Meaning |
   |---|---|
   | `plateId` | The plate the ticket is for |
   | `siteName` | Where the motorcycle is parked |
   | `entryAt` | When the session started |
   | `durationMinutes` | How long it has been parked |
   | `fee` | The amount now due, with the currency |
   | `pricingPolicyVersion` | Which policy produced the fee |
   | `paymentStatus` | `UNPAID` / `PENDING` / `PAID` / `FAILED` / `EXEMPT` / `VOIDED` |
   | `sessionStatus` | The live session state |
   | `ticketStatus` | `ISSUED` / `REVOKED` / `EXPIRED` |
   | `status` | The verification verdict (below) |

4. The **verdict vocabulary**:

   | Verdict | Meaning | Can the exit proceed? |
   |---|---|---|
   | `VALID` | Everything checks out; the fee is settled or waived | Yes |
   | `PAYMENT_PENDING` | The ticket is fine but the fee is not settled | After the payment is recorded |
   | `PLATE_MISMATCH` | The physical plate does not match the ticket | No — manual review |
   | `ALREADY_COMPLETED` | The session is already closed | No |
   | `REVOKED` | The ticket was revoked | No — manual review |
   | `EXPIRED` | The ticket is past its validity window | No — manual review |
   | `UNKNOWN` | The ticket or reference was not found | No |
   | `MANUAL_REVIEW_REQUIRED` | The session is in `MANUAL_REVIEW` | Only through an audited resolution |
   | `NOT_ACTIVE` | The session is not in a state that allows an exit | No |

5. The guard **physically compares** the plate on the motorcycle with the displayed plate. The
   system cannot do this; the guard can.

### 4.2 Completion

1. The guard records the payment (or the exemption).
2. The guard presses **Authorize Exit**.
3. The backend, in one transaction:
   - locks the session row,
   - re-checks that the session is `ACTIVE` or `EXIT_PENDING`,
   - re-checks that the ticket is `ISSUED` and unspent,
   - re-checks that the payment requirement is satisfied,
   - writes the fee snapshot,
   - sets `exit_at`, the status `COMPLETED`, and the completing guard,
   - writes the audit row.
4. The response is the completed session plus a receipt.

### 4.3 Refusal

A refusal never ends the guard's workflow. The UI shows the verdict, the reason, and the available
next steps, one of which is always **Open manual review** (with a reason).

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| EXIT-001 | The system must provide a verification operation that accepts either the ticket token (from a scanned QR) or the public reference (typed manually), and that returns a verdict together with the session facts, without authorizing an exit. | P0 |
| EXIT-002 | The verification operation must return one of exactly these verdicts: `VALID`, `PAYMENT_PENDING`, `PLATE_MISMATCH`, `ALREADY_COMPLETED`, `REVOKED`, `EXPIRED`, `UNKNOWN`, `MANUAL_REVIEW_REQUIRED`, `NOT_ACTIVE`. No other verdict may be returned. | P0 |
| EXIT-003 | The verification operation must read the **live** session state at the moment of the request, and must not rely on any cached or client-supplied state. | P0 |
| EXIT-004 | The verification response must include the plate, the site, the entry time, the duration, the fee, the currency, the pricing-policy version, the payment status, the session status, and the ticket status. | P0 |
| EXIT-005 | The system must detect a plate mismatch when the guard submits the physically observed plate and it differs from the session's normalized plate, and must return `PLATE_MISMATCH` and refuse to authorize the exit. | P0 |
| EXIT-006 | The exit completion must be a single transactional operation that re-verifies the session status, the ticket status, and the payment requirement inside the transaction, immediately before writing the completion. | P0 |
| EXIT-007 | A session that is already `COMPLETED` must not be completed again; the second attempt must fail with 409 `EXIT_ALREADY_COMPLETED` and must not modify the session. | P0 |
| EXIT-008 | Two concurrent exit completion attempts for the same session must result in exactly one successful completion; the loser must receive a conflict error and must not produce a second completion or a second audit row for a completion. | P0 |
| EXIT-009 | The payment requirement must be satisfied before an exit may complete, unless the site policy marks the fee as not required or an exemption has been granted. A `PENDING` or `FAILED` payment must block the exit. | P0 |
| EXIT-010 | An exemption must be granted by an actor holding `site.payments.exempt`, must record the reason and the authorizing actor, and must be written to the audit log. | P0 |
| EXIT-011 | A manual review case must be opened for any refusal that a guard cannot resolve directly, must record the reason, the actor, and the session, and must move the session to `MANUAL_REVIEW`. | P0 |
| EXIT-012 | A manual review case may be resolved only to `ACTIVE`, `EXIT_PENDING`, or `COMPLETED`, must require an authorized actor and a reason, and must be recorded in the audit log with the before and after states. | P0 |
| EXIT-013 | The system must provide a plate-based search of the site's active sessions as a recovery path when a ticket is lost, and the results must be restricted to the actor's site scope. | P0 |
| EXIT-014 | The exit completion must write the fee snapshot (`fee_amount_minor`, `fee_currency`) onto the session in the same transaction, so that the revenue report is stable against later pricing changes. | P0 |
| EXIT-015 | Every verification attempt, every refusal, and every completion must be recorded in the audit log with the actor, the ticket reference, the verdict, and the reason. | P0 |
| EXIT-016 | The verification endpoint must be rate-limited to at most 60 attempts per guard per minute, and the exit completion endpoint to at most 20 per guard per minute, to limit brute-force and accidental double submission. | P0 |

## 6. Acceptance criteria

### Normal

* **EXIT-001, EXIT-003, EXIT-004** — Given an `ACTIVE` session with a paid fee, when the guard
  verifies the ticket, then the verdict is `VALID` and the response includes the plate, the site,
  the entry time, the duration, the fee, the currency, the pricing-policy version, the payment
  status, the session status, and the ticket status.
* **EXIT-006, EXIT-014** — Given a valid ticket and a settled fee, when the guard authorizes the
  exit, then the response is 200, the session is `COMPLETED`, `exit_at` is set, and the fee snapshot
  matches the displayed fee.
* **EXIT-005** — Given the ticket is for plate "AB123" and the guard observes plate "AB124", when
  the guard submits the observed plate, then the verdict is `PLATE_MISMATCH` and the exit is not
  authorized.

### Failure

* **EXIT-002** — Given a revoked ticket, when it is verified, then the verdict is `REVOKED`.
* **EXIT-007** — Given a `COMPLETED` session, when the guard authorizes the exit again, then the
  response is 409 with `EXIT_ALREADY_COMPLETED` and the session is unchanged.
* **EXIT-009** — Given a session whose payment is `UNPAID`, when the guard authorizes the exit, then
  the response is 409 with `EXIT_PAYMENT_REQUIRED`.
* **EXIT-009** — Given a session whose payment is `PENDING`, when the guard authorizes the exit,
  then the response is 409 with `EXIT_PAYMENT_REQUIRED`.
* **EXIT-010** — Given a guard without `site.payments.exempt`, when the guard attempts to exempt a
  fee, then the response is 403 with `AUTHZ_PERMISSION_DENIED`.
* **EXIT-013** — Given a guard at site "S1", when the guard searches for plate "AB" at site "S2",
  then the response is 403 with `AUTHZ_SCOPE_DENIED`.

### Abuse

* **EXIT-008** — Given a valid ticket, when two exit completions are sent simultaneously, then
  exactly one succeeds, one completion audit row exists, and the loser receives 409.
* **EXIT-002** — Given a ticket that was never issued, when the guard verifies a random reference,
  then the verdict is `UNKNOWN` and no session details are disclosed.
* **EXIT-013** — Given a guard at site "S1", when the guard searches for a plate that has sessions
  at several sites, then only the sessions at "S1" are returned.
* **EXIT-011** — Given a `PLATE_MISMATCH` verdict, when the guard opens a manual review, then the
  session becomes `MANUAL_REVIEW` and an audit row records the reason.
* **EXIT-012** — Given a manual review case, when an actor without `site.review.resolve` attempts
  to resolve it, then the response is 403 and the case remains open.
* **EXIT-015** — Given 10 verification attempts, when the audit log is queried, then 10
  `exit.verified` rows exist, each naming the actor and the verdict.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Should the guard be able to complete an exit with a plate search when the ticket is lost, without a manual review? | Product owner | Phase 4 (current answer: no — a manual review is required, and the resolution is audited) |
| Q2 | What is the maximum parking duration before a session must be escalated? | Product owner | Phase 7 |
| Q3 | Should the site policy allow a "free exit" (no fee) configuration? | Product owner | Phase 4 |

## 8. Related

* `specs/features/guest-ticket/` — the ticket being verified.
* `specs/features/pricing-and-payment/` — the fee and the payment requirement.
* `specs/features/audit/` — the audit records.
* `specs/security/threat-model.md` — screenshot replay and ticket theft.
