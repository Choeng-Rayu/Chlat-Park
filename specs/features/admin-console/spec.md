# Admin Console

**Status:** In progress
**Requirement IDs:** ADMIN-001 … ADMIN-014
**Depends on:** `authorization`, `audit`

---

## 1. Problem

The platform operator's question is not "how much money" — it is **"is this product actually being
used, and by whom?"** The owner's own report answers "how is my lot doing". The platform needs a
higher-level answer:

* **Revenue** — collected, exempt (leakage), voided (corrections), failed.
* **Adoption** — how many parking lots are on the platform, how many owners, and how many
  *motorcycle owners* are actually parking through it.

The second question is the interesting one, and it is the one that a naive implementation gets
wrong. **Registration is optional**, so the majority of usage is by guests who never create an
account. Counting `users` rows would report a product that looks unused. The only identifier a
guest has is the **plate** — so the platform counts distinct plates through a keyed digest
(`plate_digest = HMAC-SHA256(pepper, normalized_plate)`), which counts people without keeping
readable plates around.

The console shows **aggregates and per-site breakdowns**. It never shows a raw plate list.

## 2. Scope

### 2.1 In scope

* Platform-level revenue: collected, exempt, voided, failed, and uncollected at close.
* Adoption metrics: registered users, distinct guests ever parked, combined active users, the
  funnel (sessions → claims → tickets → completions), the claim rate, the completion rate, the
  repeat rate, and the registered-vs-guest split.
* Per-site and per-owner breakdowns.
* Monthly trends.
* Platform management of owners and sites.
* Platform audit reading and export.
* The per-plate detail view: super-admin only, permission-gated, and audit-logged.

### 2.2 Out of scope

* A data-warehouse or BI tool; the console is query-driven against the operational database.
* Real-time streaming dashboards; the console is a polled view.
* Predictive analytics or churn modelling.
* Per-owner financial statements (the owner has their own report).
* Exporting raw plate data as a product feature (see §7 Q2).

## 3. Actors

| Actor | Interaction |
|---|---|
| Platform administrator (super admin) | Everything in this spec |
| Parking owner | None — the owner console is a separate feature |
| Security guard | None |

## 4. Behaviour

### 4.1 Revenue

The revenue panel shows four money figures for the selected period, each computed from the
`payments` table:

| Figure | Definition | Meaning |
|---|---|---|
| **Collected** | `SUM(amount_minor) WHERE status = 'PAID'` | Real revenue |
| **Exempt** | `SUM(amount_minor) WHERE status = 'EXEMPT'` | **Leakage** — shown prominently, never folded into revenue |
| **Voided** | `SUM(amount_minor) WHERE status = 'VOIDED'` | Corrections — subtracts from revenue |
| **Failed** | `COUNT(*) WHERE status = 'FAILED'` | A count, not money |

Plus **uncollected at close**: completed sessions with no `PAID` payment, valued with the fee
snapshot. The panel also warns when payments exist in the window that have no `captured_at`, so a
payment that was recorded but never captured cannot silently vanish from the report.

### 4.2 Adoption

The adoption panel answers "how many real motorcycle owners are using this?" through two identity
channels, counted separately and then combined:

* **Registered owners** — `users` where `role = 'user'`.
* **Guests** — `count(DISTINCT plate_digest)` over the sessions.

The **funnel** is the most telling number:

```
sessions created  →  entry claims issued  →  tickets issued  →  sessions completed
                     100%                      claim rate          completion rate
```

The **claim rate** (`tickets / sessions`) is the truest "are owners actually using it" signal: it
measures how often a monitor QR was successfully turned into a ticket.

### 4.3 Platform management

The super admin can create a parking owner, create a site for an owner, suspend an owner or a
user, and deactivate a site.

### 4.4 Audit export

The super admin can export the audit log for a period and a filter. The export itself is an audited
action, is rate-limited, and is limited in size.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| ADMIN-001 | The system must compute platform revenue from the `payments` table using integer minor units, and must present collected, exempt, voided, and failed as separate figures. | P0 |
| ADMIN-002 | The system must never include `EXEMPT` or `VOIDED` amounts in the collected revenue figure. | P0 |
| ADMIN-003 | The system must report uncollected-at-close as the count and the total value of completed sessions with no `PAID` payment, valued using the session's fee snapshot. | P0 |
| ADMIN-004 | The system must count distinct guests using `count(DISTINCT plate_digest)` and must never expose a `plate_digest` value in any response. | P0 |
| ADMIN-005 | The system must count registered owners as the number of users with the role `user`, and must report them separately from the distinct-guest count. | P0 |
| ADMIN-006 | The system must report the funnel metrics: sessions created, entry claims issued, tickets issued, sessions completed, the claim rate, and the completion rate, for a selected period. | P0 |
| ADMIN-007 | The system must report the repeat rate as the number of distinct plates with at least two sessions divided by the number of distinct plates, for a selected period. | P0 |
| ADMIN-008 | The system must report the registered-versus-guest session split and must provide per-site and per-owner breakdowns. | P0 |
| ADMIN-009 | The system must provide a monthly trend of new distinct plates and of session counts. | P0 |
| ADMIN-010 | The admin console must not display a raw list of plates; every view must be an aggregate or a per-site breakdown. | P0 |
| ADMIN-011 | A per-plate detail view must require `platform.analytics.read` **and** `platform.audit.export`, must be rate-limited, and must itself be written to the audit log. | P0 |
| ADMIN-012 | Every platform action that changes state (creating an owner or a site, suspending a user or an owner, deactivating a site) must be written to the audit log with the actor. | P0 |
| ADMIN-013 | The audit export must be rate-limited, must be bounded in size, and must record the filter, the row count, and the actor in the audit log. | P0 |
| ADMIN-014 | Every platform-wide query must be executed with a time range, and the maximum range must be bounded to prevent a full-table scan of the session history. | P0 |

## 6. Acceptance criteria

### Normal

* **ADMIN-001, ADMIN-002** — Given payments of 10.00 `PAID`, 2.00 `EXEMPT`, and 1.00 `VOIDED` in
  the period, when the revenue panel is loaded, then collected is 10.00, exempt is 2.00, voided is
  1.00, and the collected figure does not include the exempt or voided amounts.
* **ADMIN-003** — Given 3 completed sessions with a fee snapshot of 1.00 each and no `PAID`
  payment, when the revenue panel is loaded, then uncollected is 3 sessions and 3.00.
* **ADMIN-005, ADMIN-004** — Given 50 registered users and 300 distinct guest plates, when the
  adoption panel is loaded, then the registered count is 50, the distinct guest count is 300, and
  the combined active user count is the union of the two for the window.
* **ADMIN-006** — Given 100 sessions, 90 tickets, and 80 completions in the period, when the
  funnel is loaded, then the claim rate is 0.90 and the completion rate is 0.80.
* **ADMIN-007** — Given 100 distinct plates of which 25 have at least two sessions, when the repeat
  rate is loaded, then it is 0.25.
* **ADMIN-009** — Given sessions across three months, when the trend is loaded, then there is one
  row per month with the new distinct plate count and the session count.

### Failure

* **ADMIN-014** — Given a request for a range longer than 366 days, then the response is 400 with
  `VALIDATION_FAILED`.
* **ADMIN-011** — Given a super admin without `platform.audit.export`, when the per-plate view is
  requested, then the response is 403 with `AUTHZ_PERMISSION_DENIED`.
* **ADMIN-002** — Given a period containing only `EXEMPT` payments, when the revenue panel is
  loaded, then the collected figure is 0 and the exempt figure is non-zero.
* **ADMIN-010** — Given the adoption panel response, when the payload is inspected, then no field
  contains a `plate_digest`.

### Abuse

* **ADMIN-010** — Given 10 000 sessions, when the adoption panel is loaded, then the response size
  is bounded and contains no per-plate rows.
* **ADMIN-011** — Given a super admin with both permissions, when the per-plate view is used 5
  times in a minute, then the 6th request is rate-limited and every use is audit-logged.
* **ADMIN-013** — Given an export of 100 000 audit rows, then the request is rejected with a
  message stating the maximum export size, and the attempt is audited.
* **ADMIN-012** — Given a super admin suspends an owner, when the audit log is queried, then a
  `platform.owner_suspended` row exists naming the actor and the owner.
* **ADMIN-001** — Given payments recorded in the period but never captured, when the revenue panel
  is loaded, then the count of uncaptured payments is shown as a warning.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | What is the maximum export size for the audit log? | Engineering | Phase 5 (current answer: 100 000 rows) |
| Q2 | Under what conditions may a raw plate export be produced at all? | Product owner | Deferred — no bulk plate export in the MVP |
| Q3 | Should the adoption panel show a "registered vs guest" trend by month? | Product owner | Phase 5 |
| Q4 | What is the retention of `plate_digest` relative to the readable plate? | Product owner | Before Phase 5 — see ADR-009/ADR-010 |

## 8. Related

* `specs/architecture/rbac-design.md` §9 — the revenue and adoption metric design.
* `specs/features/audit/` — the audit read and export.
* `specs/security/threat-model.md` — the per-plate view's threat analysis.
* ADR-010 — guest identity and privacy.
