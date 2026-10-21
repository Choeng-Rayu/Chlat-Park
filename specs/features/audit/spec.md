# Audit Log

**Status:** In progress
**Requirement IDs:** AUDIT-001 … AUDIT-014
**Depends on:** `authorization`

---

## 1. Problem

A parking system makes two kinds of promises to two different parties. To the **owner**, the
system can account for the money: who took it, when, and under what authority. To the **platform**,
it can explain what happened: who created this session, who voided that payment, who changed that
price.

Both promises rest on one artefact: an append-only audit log that records **who did what, to
which entity, when, and why** — and that cannot be edited or deleted by the people it records.

Two rules make it trustworthy:

1. **The audit row is written in the same transaction as the change it describes.** A session
   without its `session.created` row, or a completed exit without its `exit.completed` row, is a
   bug — not a tolerable gap.
2. **Audit records are immutable.** There is no update and no delete. A correction is a *new* row
   that supersedes the old one.

## 2. Scope

### 2.1 In scope

* The audit event catalogue: which actions are recorded.
* The audit record structure: actor, site, action, entity, reason, metadata, timestamp.
* Writing the audit row in the same transaction as the state change.
* Reading the audit log, scoped: an owner sees their own sites, a super admin sees everything.
* Exporting the audit log, with a bound and a rate limit.
* Immutability: no update, no delete.
* Redaction: the log must not contain raw tokens, credentials, or unnecessary personal data.
* Retention.

### 2.2 Out of scope

* A general-purpose event bus or a data warehouse.
* Real-time audit streaming to a SIEM (the pilot's scale does not need it; the export covers it).
* Per-field change diffs for every entity (the metadata carries a small, explicit change set).

## 3. Actors

| Actor | Interaction |
|---|---|
| Platform administrator | Reads the platform audit log; exports it |
| Parking owner | Reads the audit log for their own sites |
| Security guard | Their own actions are recorded; they read the site log for context |
| Anyone | Cannot modify or delete an audit record |

## 4. Behaviour

1. A domain service changes state. In the **same transaction** it calls
   `AuditService.write({ action, entityType, entityId, siteId, reason, metadata })`.
2. The row is inserted with the actor id, the server timestamp, and a request id.
3. The transaction commits. If it rolls back, the audit row rolls back with it — the log never
   describes a change that did not happen.
4. A reader queries the log with filters: site, actor, action, entity, and a time range.
5. An export produces a file from the same query, bounded in size.

## 5. The action catalogue

| Action | Recorded when | Site scope |
|---|---|---|
| `auth.login` | A successful sign-in | actor's scope |
| `auth.login_failed` | A failed sign-in | — |
| `auth.logout` | A sign-out | actor's scope |
| `auth.token_reuse_detected` | A refresh-token replay | actor's scope |
| `authz.permission_denied` | A permission check fails | target site |
| `authz.scope_denied` | A scope check fails | target site |
| `authz.grant_created` / `authz.grant_revoked` | A grant changes | — |
| `authz.assignment_changed` | A site assignment changes | affected site |
| `site.created` / `site.settings.updated` / `site.deactivated` / `site.reactivated` | A site changes | the site |
| `owner.staff_invited` / `owner.staff_deactivated` | Staff changes | the site |
| `pricing.policy_created` | A pricing version is created | the site |
| `session.created` | A session is created | the site |
| `session.activated` | A session is activated (by claim or manually) | the site |
| `session.cancelled` | A session is cancelled | the site |
| `session.transitioned` | Any other state transition | the site |
| `entry_claim.issued` / `entry_claim.claimed` / `entry_claim.reissued` / `entry_claim.revoked` | The claim lifecycle | the site |
| `ticket.issued` / `ticket.revoked` / `ticket.linked` / `ticket.link_failed` | The ticket lifecycle | the site |
| `exit.verified` | Every exit verification attempt | the site |
| `exit.requested` / `exit.completed` / `exit.aborted` / `exit.refused` | The exit flow | the site |
| `payment.recorded` / `payment.voided` / `payment.exempted` | The payment lifecycle | the site |
| `review.opened` / `review.resolved` | The review workflow | the site |
| `admin.plate_detail_viewed` | The per-plate view is used | — |
| `admin.audit_exported` | An export is produced | — |
| `platform.owner_suspended` / `platform.user_suspended` / `platform.site_deactivated` | A platform action | the affected site |
| `sync.conflict_detected` | A sync conflict is recorded | the site |

## 6. Requirements

| ID | Requirement | Priority |
|---|---|---|
| AUDIT-001 | The system must write an audit row for every action in the catalogue above, and the catalogue must be the single source of truth for the action names. | P0 |
| AUDIT-002 | The audit row must be written in the same database transaction as the state change it describes, so that the two commit or roll back together. | P0 |
| AUDIT-003 | An audit row must record the actor user id, the site id, the action, the entity type, the entity id, an optional reason, a metadata object, the server timestamp, and the request id. | P0 |
| AUDIT-004 | The system must provide no operation that updates or deletes an audit row. | P0 |
| AUDIT-005 | Reading the audit log must be restricted to sites in the actor's scope; an owner must not see another owner's entries, and a guard must not see sites they are not assigned to. | P0 |
| AUDIT-006 | The audit log must support filtering by site, actor, action, entity, and a time range, and must be paginated. | P0 |
| AUDIT-007 | The export must be bounded to at most 100 000 rows and must be rate-limited, and the export action itself must be audited with the filter and the row count. | P0 |
| AUDIT-008 | An audit row must never contain a raw claim token, a raw ticket token, a password, a password hash, a cookie, an authorization header, a bot token, or the plate pepper. | P0 |
| AUDIT-009 | An audit row may contain the plate digest, the ticket reference, and the session id, but must not contain the readable plate unless the action is explicitly about the plate and the actor is authorized for it. | P0 |
| AUDIT-010 | A denied request must produce an audit row identifying the actor, the route, the required permission, the target site, and the request id. | P0 |
| AUDIT-011 | A manual override, a payment void, a payment exemption, and a review resolution must all require a non-empty reason, and the reason must be stored with the audit row. | P0 |
| AUDIT-012 | The audit log must be retained for at least 24 months, and the retention job must delete only rows older than the retention period and only in bounded batches. | P1 |
| AUDIT-013 | The audit write must not fail the business operation when the audit write itself fails for a non-transactional reason; but where the audit write is part of the business transaction, a failure must roll the transaction back. | P0 |
| AUDIT-014 | Every audit row must carry the request id so that a specific request can be traced from the API response to the log. | P0 |

## 7. Acceptance criteria

### Normal

* **AUDIT-001, AUDIT-002, AUDIT-003** — Given a guard creates a session, when the request completes,
  then an audit row exists with the action `session.created`, the actor, the site, the session id,
  the server timestamp, and the request id.
* **AUDIT-001** — Given a full entry-to-exit flow, when it completes, then rows exist for
  `session.created`, `entry_claim.issued`, `entry_claim.claimed`, `ticket.issued`, `exit.verified`,
  `payment.recorded`, and `exit.completed`.
* **AUDIT-006** — Given 500 audit rows across 3 sites, when the owner filters by site and action,
  then only the matching rows are returned and the response is paginated.

### Failure

* **AUDIT-002** — Given the audit insert fails during a session creation, when the transaction
  rolls back, then no session exists and no orphan audit row exists.
* **AUDIT-005** — Given owner "O1" owns "S1", when owner "O1" reads the audit log, then no row for
  "S2" appears.
* **AUDIT-011** — Given a guard attempts to void a payment without a reason, then the request is
  rejected and no audit row claims a void happened.
* **AUDIT-004** — Given any audit row, when a delete or update is attempted through the API, then
  the operation is not available and the row still exists.

### Abuse

* **AUDIT-008** — Given a full claim and exit flow, when the audit log is inspected, then no row
  contains a raw claim token, a raw ticket token, a password, or the bot token.
* **AUDIT-010** — Given a guard requests a site they are not assigned to, then an
  `authz.scope_denied` row exists with the actor, the route, the required permission, the target
  site, and the request id.
* **AUDIT-007** — Given 200 000 audit rows, when a super admin requests an export of the full
  period, then the request is rejected with the maximum size, and the attempt is audited.
* **AUDIT-013** — Given the audit write fails inside a business transaction, when the operation is
  attempted, then the operation fails and no partial state exists.
* **AUDIT-012** — Given audit rows older than the retention period, when the retention job runs,
  then only rows older than the period are deleted, in bounded batches, and the newer rows are
  untouched.

## 8. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Is 24 months the right retention for the pilot, and does a longer retention apply to payment records? | Product owner | Phase 5 (ADR-009) |
| Q2 | Should the audit log be streamed to an external SIEM? | Engineering | Deferred — not needed at pilot scale |
| Q3 | Should an owner be able to export their own site's audit log? | Product owner | Phase 5 |

## 9. Related

* `specs/features/admin-console/` — the platform audit view and the export.
* `specs/features/owner-management/` — the owner audit view.
* `specs/data/schema.md` — the `audit_logs` model.
* ADR-009 — retention.
