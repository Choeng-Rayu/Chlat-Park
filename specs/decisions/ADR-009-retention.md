# ADR-009: Ticket and Session Retention

**Status:** Accepted (with deferred sub-decisions)
**Date:** 2026-10-21
**Deciders:** Product owner, engineering
**Requirement IDs:** SESSION-014, TICKET-001, AUDIT-012, ADMIN-004

---

## Context

Chlat-Park stores three categories of data with very different lifetimes and very different
sensitivity:

| Category | What it is | Why it is kept | Sensitivity |
|---|---|---|---|
| **Operational** | The sessions, the tickets, the entry claims, the refresh tokens | To run the parking lot, and to settle a dispute about a specific visit | Medium — the plate is personal data |
| **Financial** | The payments, the pricing policies, the fee snapshots | To account for the revenue and to answer "was this paid?" | Low — no personal data beyond the plate reference |
| **Accountability** | The audit log | To explain who did what, and to prove the system's integrity | Medium — it names the actors |

The plate is the sensitive part. A motorcycle's plate is personal data belonging to the rider, who
may have no relationship with the parking lot and never consented to anything. Retaining readable
plates for years creates a data set the business has no use for and a liability it cannot justify.

At the same time, the platform's **adoption metric** depends on counting distinct plates over
time (ADR-010), so the readable plate can be dropped while a non-reversible digest is kept.

The retention periods themselves depend on the pilot's jurisdiction and on the parking owner's
contractual obligations, which are not fully known yet.

## Decision

1. **The default retention periods are:**

   | Data | Retention | After the period |
   |---|---|---|
   | `parking_sessions.plate_id_normalized` | 90 days after the session closes | **Redacted** to `NULL`. The row, the ticket, the payments, and the audit rows are kept. |
   | `parking_sessions.plate_digest` | Retained indefinitely | Kept — it is the lifetime distinct-guest counter and is not reversible |
   | `tickets`, `entry_claims` | 90 days after the session closes | Deleted |
   | `parking_sessions` (the rest) | 24 months | Kept — the operational and financial record |
   | `payments` | Indefinite | Kept — the financial record. A correction is `VOIDED`, never deleted |
   | `pricing_policies` | Indefinite | Kept — the price history |
   | `audit_logs` | 24 months | Deleted in bounded batches |
   | `refresh_tokens` | 30 days after expiry | Deleted |

2. **Redaction is not deletion.** The redaction job sets `plate_id_normalized = NULL`. The session
   row, the ticket reference, the amounts, the timestamps, and the audit trail all survive. A
   dispute about a visit from eight months ago can still be answered — "a session existed, it was
   completed, 1.50 was collected" — without retaining the rider's plate.

3. **The redaction is irreversible.** There is no restore path for the readable plate, by design.
   A backup taken before the redaction still contains it, which is why the backup retention is a
   separate concern (§6).

4. **The payment record is never deleted.** A voided payment stays as a `VOIDED` row. Deleting a
   financial record is never the correction mechanism.

5. **The audit log is retained for 24 months** and is deleted only by the retention job, in
   bounded batches, and only for rows older than the period. There is no API that deletes an audit
   row, and the database role has no `DELETE` grant on the table.

6. **The retention jobs are idempotent**, run in **bounded batches**, and log a summary of what
   they changed.

7. **Every period is configurable** through the environment, so a parking owner with a contractual
   obligation (or a jurisdiction with a legal one) can extend it without a code change.

## Consequences

### Positive

* **The data set is proportional to the need.** The readable plate is kept for as long as it is
  operationally useful (a dispute window) and not for years.
* **The dispute window is preserved.** A complaint about a visit four months later can still be
  investigated — the session, the amount, and the timeline survive.
* **The adoption metric survives the redaction.** The `plate_digest` is retained, so the lifetime
  distinct-guest count is unaffected.
* **The audit trail survives.** The accountability record outlives the operational data it describes.
* **The privacy notice can be honest.** "We keep your plate for 90 days, then we keep a
  non-reversible identifier for counting" is a defensible position.
* **The financial record is complete.** Every amount ever collected, and every correction, is
  still there years later.

### Negative

* **A dispute about the plate itself cannot be answered after 90 days.** The platform can say
  "a session existed for a plate with the digest X", but not "the plate was AB-123". Accepted: the
  platform has no legitimate need for the readable plate beyond the dispute window.
* **The backups retain the plates for the backup window.** A backup taken yesterday contains the
  plates that were readable yesterday. This is the biggest residual privacy exposure.
* **The 90-day and 24-month defaults may not match the local law** or the parking owner's
  contractual obligations. They are configurable, but the *default* must be reviewed before
  production.
* **The digest is retained indefinitely**, which is a small but permanent fingerprint of each
  motorcycle. It is justified by the adoption metric, and it is defensible, but it is not free.

## Deferred sub-decisions

| # | Question | Notes | Target |
|---|---|---|---|
| D1 | What is the exact retention period for payments in the pilot's jurisdiction? | The current answer: indefinite for the financial record, pending a legal review. | Before Phase 7 |
| D2 | Is 24 months the right audit retention? | It may need to be longer, or jurisdiction-specific. | Phase 5 |
| D3 | What is the backup retention window? | The current answer: 14 days of daily backups, plus one offsite copy. The backup window therefore extends the readable-plate exposure by up to 14 days. | Phase 5 |
| D4 | Should a parking owner be able to configure a shorter retention? | A contractual requirement might demand it. | Phase 5 |
| D5 | Should the redaction window be 90 days from the session close or from the last visit? | The current answer: from the session close. | Phase 5 |
| D6 | What is the legal basis for retaining the `plate_digest` indefinitely? | Legitimate interest (aggregate analytics) is the likely basis; it must be confirmed before the privacy notice is published. | Before Phase 7 |

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Retain everything indefinitely | A data set with no use and a real liability. The readable plate has an operational life; after that, the digest is enough. |
| Delete the whole session after the window | The financial and accountability records must survive. Redaction is the surgical answer. |
| Retain the readable plate and drop the digest | The adoption metric dies, and the platform loses the ability to count real-world usage — which is the product owner's explicit goal. |
| Drop the digest with the plate | Same as above. The digest is the whole reason the redaction is acceptable. |
| Redact the plate in the backups too | The backups must be restorable. Rewriting the backups is not feasible. The exposure is bounded by the backup window. |
| Use a shorter plate retention (30 days) | A 30-day dispute window is tight for a cash payment dispute. 90 days is a reasonable middle. |
| Let the API delete a session | It would break the audit trail and the financial record. The `CANCELLED` and `VOIDED` states exist precisely so that nothing needs deleting. |

## Related

* `specs/data/schema.md` §8 — the retention table and the redaction job.
* `specs/data/migrations.md` §7 — the retention jobs.
* `specs/features/audit/` — the audit log's immutability.
* ADR-010 — the guest identity and the digest.
