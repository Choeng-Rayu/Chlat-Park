# Chlat-Park — Specification-Driven Development

> **Specifications are the source of truth for expected behavior.**
> If the code and a spec disagree, the spec is a bug report. If a spec and the product owner's
> stated intent disagree, the spec is stale. Neither is resolved by editing code first.

Chlat-Park is an **E-Ticket Parking System**: manual, guard-assisted motorcycle parking entry and
exit, where a paper ticket is replaced by a QR-linked e-ticket bound to a motorcycle plate and a
parking session. Camera / ANPR plate recognition and barrier automation are **out of scope**.

---

## 1. The SDD loop

```
Clarify requirement
      ↓
Write / update feature spec            (specs/features/<feature>/spec.md)
      ↓
Review acceptance criteria + edge cases (spec.md "Acceptance criteria" + acceptance.feature)
      ↓
Define API / data contract             (specs/api/openapi.yaml, specs/data/schema.md)
      ↓
Create implementation tasks             (specs/features/<feature>/tasks.md)
      ↓
Implement the smallest vertical slice  (one task at a time, requirement IDs in scope)
      ↓
Run automated tests and static checks   (specs/testing/strategy.md)
      ↓
Review security and UX                 (specs/security/threat-model.md)
      ↓
Update docs / specs                     (specs/**, docs/**)
      ↓
Merge only when acceptance criteria pass
```

**Rules of the loop**

| # | Rule |
|---|---|
| 1 | No business-critical feature is implemented from an informal prompt alone. |
| 2 | A feature is not "done" because code exists; it is done when its acceptance criteria pass. |
| 3 | Do not invent new requirements or change API contracts without updating the spec first. |
| 4 | Domain rules live in the backend / domain layer — never duplicated in `apps/web` or in the Telegram module. |
| 5 | Every privileged action is authorized by the backend. Hiding a button in the UI is not authorization. |
| 6 | Unresolved questions are **recorded**, not silently decided. See §6. |
| 7 | A behavior change updates the spec in the same pull request as the code. |

---

## 2. Repository layout of the specifications

```
specs/
├── README.md                  # this file — SDD loop, ID namespace, DoR / DoD
├── product/                   # what the product is, for whom, and what it is not
│   ├── product-brief.md
│   ├── personas-and-roles.md
│   └── glossary.md
├── architecture/              # how the system is shaped
│   ├── system-context.md      # C4 L1
│   ├── container-architecture.md
│   ├── deployment.md
│   ├── rbac-design.md
│   └── offline-architecture.md # DEFERRED — see banner inside
├── features/                  # one folder per feature, 4 artifacts each
│   └── <feature>/
│       ├── spec.md
│       ├── design.md
│       ├── tasks.md
│       └── acceptance.feature
├── api/
│   ├── README.md              # OpenAPI generation + drift check
│   └── openapi.yaml           # GENERATED — do not hand-edit
├── data/
│   ├── schema.md
│   └── migrations.md
├── security/
│   ├── threat-model.md
│   └── access-control-matrix.md
├── testing/
│   ├── strategy.md
│   └── test-matrix.md
└── decisions/                 # ADRs, immutable once Accepted
    └── ADR-NNN-slug.md
```

`docs/` holds **operational runbooks** (deployment, backup/restore, guard training, incident
response). Runbooks describe *how operators run the system*. Specs describe *what the system must
do*. When they disagree about product behaviour, the spec wins and the runbook is a bug.

---

## 3. Requirement ID namespace

Every requirement has a **stable, permanent ID**. IDs are never renumbered and never reused.
Format: `<DOMAIN>-<NNN>`, three digits, zero-padded.

| Prefix | Domain | Spec of record | Typical surface |
|---|---|---|---|
| `AUTH-` | Authentication, session lifecycle, credential handling | `features/authentication/` | login, logout, password, cookie session |
| `RBAC-` | Permissions, scopes, grants, site-scoped authorization | `features/authorization/` | `PermissionGuard`, `ScopeResolver` |
| `PARK-` | Parking sites, site selection, site settings, guards at a site | `features/parking-sites/` | site CRUD, timezone, currency |
| `SESSION-` | Parking session lifecycle and state machine | `features/parking-session/` | create, activate, cancel, list |
| `CLAIM-` | Entry QR issuance and guest claim of the entry QR | `features/entry-qr-claim/` | claim token TTL, single use |
| `TICKET-` | E-ticket issuance, display, guest ↔ account linking | `features/guest-ticket/` | ticket token, safe public payload |
| `EXIT-` | Exit verification, plate check, exit completion | `features/exit-verification/` | verify, authorize exit, complete |
| `PRICE-` | Pricing policies, version, fee calculation, rounding | `features/pricing-and-payment/` | fee preview, snapshot |
| `PAY-` | Payment states, manual cash recording, exemptions | `features/pricing-and-payment/` | record payment, void, exempt |
| `OWN-` | Parking owner / site manager operations | `features/owner-management/` | sites, staff, pricing, reports |
| `ADMIN-` | Platform administration, revenue and adoption analytics | `features/admin-console/` | platform metrics, exports |
| `TG-` | Telegram bot channel | `features/telegram-bot/` | webhook, deep links, delivery |
| `AUDIT-` | Audit log content, coverage, export | `features/audit/` | audit writes, retention |
| `SYNC-` | Offline authority and event synchronization | `features/offline-sync/` | event queue, conflict policy |
| `SEC-` | Cross-cutting security controls | `features/security/` | rate limits, secrets, headers |
| `I18N-` | Khmer / English localisation | `features/internationalization/` | message keys, fallback |
| `OPS-` | Deployment, health, backup, rollback | `docs/` + `architecture/deployment.md` | health probes, runbooks |

> **`OPS-` is not a feature folder.** The operational requirements live in the runbooks
> (`docs/deployment.md`, `docs/database-backup-restore.md`, `docs/incident-response.md`) and in
> `specs/architecture/deployment.md`, because they describe how the system is *run* rather than how
> it behaves. They are exercised by the operational drills, not by an `acceptance.feature`.

**ID conventions**

* One requirement = one testable behaviour. If it needs "and" twice, split it.
* Requirement text is normative. It uses **must** / **must not** / **may**.
* A requirement that is not yet settled is written as `OPEN-xxx` inside the relevant ADR, never as a
  placeholder in an MVP feature spec.

---

## 4. Definition of Ready (DoR)

A feature may be **implemented** only when every item below is true.

- [ ] The user outcome is stated in one sentence.
- [ ] In-scope and out-of-scope are written explicitly.
- [ ] Normal, failure and abuse cases are described.
- [ ] State transitions are defined (source state, trigger, target state, guard conditions).
- [ ] API and database impacts are understood (OpenAPI delta, migration + rollback).
- [ ] Authorization and privacy implications have been reviewed against
      `security/access-control-matrix.md`.
- [ ] Acceptance criteria are written in Given/When/Then and are testable.
- [ ] Dependencies and migration risks are identified.
- [ ] Requirement IDs are assigned from the namespace in §3.
- [ ] Open questions are recorded in an ADR (or listed in the feature spec's "Open questions" with
      an owner and a target resolution date).

## 5. Definition of Done (DoD)

A feature may be **merged** only when every item below is true.

- [ ] All acceptance criteria pass.
- [ ] Unit and integration tests pass.
- [ ] Relevant e2e tests pass (e2e runs against a real database, not an in-memory fake).
- [ ] Lint, typecheck and build pass for affected applications.
- [ ] Authorization is tested at the API boundary — a request with a valid token but the wrong
      scope must be rejected.
- [ ] Database migrations and their rollback are documented in `specs/data/migrations.md`.
- [ ] Logs do not leak raw ticket tokens, claim tokens, credentials, or unnecessary personal data.
- [ ] User-facing loading, error, empty and offline states are handled.
- [ ] Documentation and OpenAPI contracts are updated (and the OpenAPI drift check passes).
- [ ] Specs and ADRs are updated to match the shipped behavior.
- [ ] Code review approved.
- [ ] Deployed to staging and smoke-tested.

---

## 6. When something is not decided yet

The project has already **settled** the following (see `specs/decisions/`):

* repository layout (ADR-001), online-first (ADR-002), offline authority model (ADR-003),
* session activation on claim (ADR-004), pricing/payment MVP scope (ADR-005),
* permission-based RBAC (ADR-006), plate normalization (ADR-007),
* entry QR token design (ADR-008), retention (ADR-009), guest identity/privacy (ADR-010),
* contract-first OpenAPI (ADR-011), currency and rounding (ADR-012), Telegram delivery (ADR-013).

Everything still open is recorded as a **Deferred** sub-decision inside the relevant ADR, with the
candidate options spelled out. Deferred does not mean "ignore": implement only the behaviour that
is already specified, and never hardcode an assumption that is likely to change.

---

## 7. Adding a new feature folder

```
specs/features/<feature-slug>/
├── spec.md              # §7.1 template below
├── design.md            # §7.2 template below
├── tasks.md             # §7.3 template below
└── acceptance.feature   # §7.4 template below
```

### 7.1 `spec.md` template

```markdown
# <Feature name>

**Status:** Draft | In progress | Planned (P1) | Deferred
**Requirement IDs:** <PREFIX>-001, <PREFIX>-002, …
**Depends on:** <other feature slugs>

## 1. Problem
## 2. Scope
### 2.1 In scope
### 2.2 Out of scope
## 3. Actors
## 4. Behaviour
## 5. Requirements
| ID | Requirement | Priority |
|---|---|---|
## 6. Acceptance criteria
## 7. Open questions
```

### 7.2 `design.md` template

```markdown
# <Feature name> — Design

## 1. Architecture
## 2. Data model
## 3. State transitions
## 4. Failure handling
## 5. Security considerations
## 6. Observability
## 7. Alternatives considered
```

### 7.3 `tasks.md` template

Numbered, ordered, each task naming the requirement IDs it satisfies and the files it touches.

### 7.4 `acceptance.feature` template

Gherkin, one `Feature:` per feature, every `Scenario:` tagged with the requirement IDs it covers:

```gherkin
# language: en
@CLAIM-001 @CLAIM-002
Scenario: Guest claims a valid entry QR
  Given a parking site "S1" with pricing policy version 3
  And a pending session with an unexpired entry claim
  When the guest claims the entry QR
  Then exactly one ticket is issued for the session
  And the session status becomes ACTIVE
```

---

## 8. Quick links

| I want to… | Read |
|---|---|
| understand the product | `specs/product/product-brief.md` |
| know who can do what | `specs/security/access-control-matrix.md` |
| understand the permission system | `specs/architecture/rbac-design.md` |
| find the data model | `specs/data/schema.md` |
| find the API contract | `specs/api/openapi.yaml` (generated) |
| know why a decision was made | `specs/decisions/` |
| know what is tested | `specs/testing/test-matrix.md` |
| deploy the thing | `docs/deployment.md` |
| train a guard | `docs/guard-training.md` |
| handle an incident | `docs/incident-response.md` |
