# Owner Management

**Status:** In progress
**Requirement IDs:** OWN-001 … OWN-012
**Depends on:** `parking-sites`, `authorization`

---

## 1. Problem

A parking owner is a business, not a person with a login. The owner needs to run their lot without
a platform administrator in the loop: create sites, hire and fire guards, set the tariff, read the
numbers, and deal with a dispute.

Three things make this harder than a normal admin console:

1. **The owner is a tenant.** Every query an owner makes is bounded by the sites they own. A
   reporting bug becomes a data breach.
2. **The owner's staff are not the owner's employees in the employment sense.** A guard has a
   personal account that must be deactivated when they leave — and it must take effect immediately,
   not when a token expires.
3. **The owner makes money decisions.** Pricing and exemptions affect revenue, so they are audited
   and they are versioned.

## 2. Scope

### 2.1 In scope

* The owner profile: a name, a status, and a link to a user account.
* Managing the owner's own sites.
* Inviting a guard to a site, assigning a site role (`guard` | `manager`), and deactivating an
  assignment.
* Deactivating a guard's access to the owner's sites, immediately.
* Creating and reading pricing policies.
* The owner's reports: sessions, payments, totals, with filters by site and date.
* Reviewing the site's audit log and manual overrides.
* Owner suspension by the platform (and the effect on the owner's access).

### 2.2 Out of scope

* Payroll, rosters, and shift scheduling.
* Multi-owner sites (a site has exactly one owner in the MVP).
* Owner-to-owner data sharing.
* Bulk import of guards.
* Owner-configurable permission grants beyond the site role (deferred — see §7).

## 3. Actors

| Actor | Interaction |
|---|---|
| Parking owner | Manages their sites, guards, pricing, reports |
| Security guard (site role `manager`) | A subset of the owner's powers, at their site |
| Platform administrator | Creates owners, suspends them, and can act on any owner's data |
| Registered owner | None — a registered owner is a *customer*, not a parking owner |

## 4. Behaviour

### 4.1 Inviting a guard

1. The owner enters a name and an email address.
2. The system creates (or links) a `User` with `role = guard`, `status = pending`, and a
   `SecurityGuard` profile.
3. The system creates a `guard_site_assignments` row with the site and the site role.
4. The guard receives a set-password link (an out-of-band flow; the MVP sends it by whatever
   channel the owner uses — the mechanics are not specified here).
5. When the guard sets a password, their status becomes `active`.

**The owner must never be able to set the guard's password directly.** A password set by the owner
would be a shared credential.

### 4.2 Deactivating a guard

Deactivating an assignment removes the site from the guard's scope immediately, and bumps their
`authzVersion` so the change takes effect on their next request — not when their token expires.

### 4.3 Reports

The owner's report view is bounded by the sites they own and supports filtering by site, date
range, and status. The totals distinguish **collected**, **exempt**, **voided**, and
**uncollected at close**.

### 4.4 Suspension by the platform

A super admin may suspend an owner. The owner's access is blocked immediately; the data is
retained for audit and revenue reporting.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| OWN-001 | The system must model a parking owner as a profile linked to a user account, with a name, a status, and a list of owned sites. | P0 |
| OWN-002 | Every owner-facing query must be restricted to the sites the owner owns, and no owner-facing endpoint may return data for a site the owner does not own. | P0 |
| OWN-003 | Inviting a guard must create a guard user account with a pending status, a security-guard profile, and a site assignment with a site role; it must not set a password. | P0 |
| OWN-004 | A guard may hold assignments at more than one site, and each assignment has its own site role. | P0 |
| OWN-005 | Deactivating a site assignment must remove that site from the guard's resolved scope immediately, by incrementing the guard's `authzVersion` in the same transaction. | P0 |
| OWN-006 | An owner must be able to read but not modify pricing policies that are already effective; changes must create a new version. | P0 |
| OWN-007 | The owner reports must support filtering by site, by date range, and by session status, and must respect the owner's site scope. | P0 |
| OWN-008 | The owner reports must present collected, exempt, voided, and uncollected-at-close amounts as separate figures, in integer minor units with the site currency. | P0 |
| OWN-009 | An owner must be able to read the audit log for their own sites, including the manual overrides and payment corrections, and must not be able to delete an audit record. | P0 |
| OWN-010 | Suspending an owner must block the owner's access immediately and must retain the owner's sites, sessions, payments, and audit records. | P0 |
| OWN-011 | The owner console must never display a raw list of plates in a report; reports must aggregate. | P0 |
| OWN-012 | An owner must not be able to grant a permission to a user outside the owner's own sites, and must not be able to change a user's coarse role. | P0 |

## 6. Acceptance criteria

### Normal

* **OWN-001, OWN-003** — Given owner "O1" invites "Nok" for site "S1" with the site role "guard",
  then a user account is created with the role "guard" and the status "pending", a security-guard
  profile exists, and an assignment links "Nok" to "S1" with the site role "guard".
* **OWN-004** — Given "Nok" is assigned to "S1" as a "guard" and to "S2" as a "manager", when the
  guard's scope is resolved, then both sites are in scope.
* **OWN-005** — Given "Nok" is assigned to "S1", when owner "O1" deactivates that assignment, then
  "Nok"'s next request for site "S1" is rejected with `AUTHZ_SCOPE_DENIED`.
* **OWN-007, OWN-008** — Given owner "O1" owns "S1" with 10 completed sessions, when the owner
  requests the report for a date range, then the response contains the collected, exempt, voided,
  and uncollected figures separately.

### Failure

* **OWN-002** — Given owner "O1" owns "S1" and owner "O2" owns "S2", when owner "O1" requests the
  report for "S2", then the response is 403 with `AUTHZ_SCOPE_DENIED`.
* **OWN-003** — Given an invitation request, when the request body contains a password, then the
  request is rejected and no password is set.
* **OWN-006** — Given an effective pricing version 3, when owner "O1" attempts to change version
  3's amount, then the request is rejected and version 3 is unchanged.
* **OWN-010** — Given owner "O1" owns "S1", when the platform suspends owner "O1", then owner "O1"'s
  next request is rejected and the sessions of "S1" still exist.

### Abuse

* **OWN-012** — Given owner "O1" attempts to grant a permission to a user who is not a guard at one
  of their sites, then the request is rejected with 403.
* **OWN-012** — Given owner "O1" attempts to change their own coarse role to "super_admin", then
  the request is rejected with 400 and the role is unchanged.
* **OWN-011** — Given 500 sessions at site "S1", when owner "O1" requests the sessions report, then
  the response contains aggregates and per-status totals and no plate list.
* **OWN-002** — Given owner "O1" iterates site ids, when they request each site's report, then
  every site that owner "O1" does not own is rejected with 403.
* **OWN-009** — Given owner "O1" requests the audit log, when the response is inspected, then no
  delete or update operation is offered for an audit record.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | How is the set-password link delivered (email, SMS, or the owner passing a code)? | Product owner | Phase 5 |
| Q2 | Should an owner be able to see a per-plate session list for their own site? | Product owner | Phase 5 (current answer: no — aggregates only) |
| Q3 | Should an owner be able to grant `site.payments.exempt` to a specific guard? | Product owner | Before Phase 5 (see `authorization` Q1) |

## 8. Related

* `specs/features/authorization/` — the permission catalogue the owner console uses.
* `specs/features/parking-sites/` — the sites the owner manages.
* `specs/features/pricing-and-payment/` — the pricing policies.
* `specs/features/audit/` — the audit log the owner reads.
