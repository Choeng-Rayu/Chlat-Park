# Chlat-Park — Product Brief

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`personas-and-roles.md`](./personas-and-roles.md) · [`glossary.md`](./glossary.md)

---

## 1. Summary

Chlat-Park replaces the paper motorcycle-parking ticket with a **digital e-ticket** bound to a
motorcycle plate number and a parking session.

A parking site has at least one security guard and a monitor. The guard types the motorcycle plate
into the guard dashboard; the system creates a parking session and displays a short-lived **entry
QR** on the monitor. The motorcycle owner scans that QR with the website/PWA or the Telegram bot and
receives an **e-ticket**. **No account is required.** When the owner returns, they show the
e-ticket QR on their phone; the guard scans it, verifies the plate and the session, records the
parking fee / payment, and closes the session.

The product is **online-first**. It is architected so that a trusted **local parking service** can be
added later without rewriting the core domain model, but reliable offline issuance and verification
are **not claimed** for the initial release.

> **The central rule of the product**
> A QR code identifies a claim or a ticket. The trusted parking system decides whether the
> associated session is currently valid and whether exit can be authorized. A screenshot is never
> proof of validity.

## 2. Goals

| # | Goal | How it is measured |
|---|---|---|
| G1 | Eliminate paper parking tickets | 100 % of sessions in the pilot have a digital ticket |
| G2 | Make entry and exit easy for owners and guards | Guard handles an entry in ≤ 2 screens, ≤ 15 s |
| G3 | Guest ticket issuance without mandatory registration | A guest can claim and exit with zero accounts |
| G4 | Two owner access channels: website/PWA **and** Telegram | Both channels call the same backend services |
| G5 | A parking owner manages one or more sites | Owner console covers sites, guards, pricing, reports |
| G6 | Record sessions, fees, payment outcomes and staff actions | Every state change has an audit row |
| G7 | Build toward reliable offline operation without rewriting the domain | Domain model + event contract are offline-ready |
| G8 | Maintainable, testable, spec-driven development | Every feature has a spec and acceptance criteria |

## 3. Non-goals (initial release)

* Camera capture, number-plate recognition (ANPR) or automatic vehicle detection.
* Automatic barrier / gate control.
* Mandatory user accounts for entering or leaving parking.
* Assuming Telegram works without an internet connection.
* Treating a screenshot as proof that a ticket is valid.
* Claiming full offline operation before the local authority, sync and conflict logic are
  implemented and tested on real hardware.
* Payment-provider integration in the MVP (manual cash recording only — see ADR-005).

## 4. Scope of the MVP

### 4.1 In scope

* Guard authentication and site-scoped authorization.
* Parking site selection; one owner → many sites.
* Plate entry, normalization and correction before commit.
* Transactional parking session creation in `PENDING_CLAIM`.
* Entry QR issuance, reissue, expiry (5 min default) and cancellation.
* Guest claim of the entry QR without an account; **claim activates the session** and starts the
  fee clock.
* E-ticket issuance with a safe public payload; screenshot-friendly display.
* Exit verification by QR scan or manual ticket-reference entry.
* Plate mismatch detection, status gating, fee preview, manual cash payment recording with an
  audited reason, exemptions, voiding, and transactional exit completion.
* Manual review cases with audited, permission-checked resolution.
* Owner console: sites, guards, pricing policies, reports.
* Super-admin console: revenue, adoption/funnel analytics, platform audit.
* Full audit log across all state transitions.
* Khmer and English UI.

### 4.2 Out of scope for the MVP (P1+)

* Telegram bot as a first-class channel (P1 — module exists in the API from day one).
* Offline local parking service, event sync, signed offline tickets (P1/P2 — see
  `architecture/offline-architecture.md`, banner: **DEFERRED**).
* Online payment providers, KHQR reconciliation, card/wallet capture.
* Per-plate admin detail view beyond aggregates (gated, audit-logged, listed in the admin spec).

## 5. The four core journeys (condensed)

1. **Entry** — guard signs in → picks site → types plate → confirms → session created
   (`PENDING_CLAIM`) → monitor shows entry QR.
2. **Claim** — owner scans the entry QR → website/PWA (or Telegram) calls the claim endpoint →
   ticket issued → session becomes `ACTIVE` → **fee clock starts**.
3. **Exit** — guard scans the e-ticket → system shows plate, site, entry time, duration, fee,
   payment state → guard checks the physical plate → records payment (or exemption) → **Authorize
   Exit** → transactional completion → session `COMPLETED`, ticket spent.
4. **Exception** — anything that does not match (plate mismatch, revoked, expired, already used,
   disputed payment) → the system **never silently authorizes**; it opens/points to a
   `MANUAL_REVIEW` case with an audited reason.

## 6. Success metrics (used by the admin console)

| Metric | Definition | Why it matters |
|---|---|---|
| Claim rate | `tickets issued / sessions created` | The truest "are owners actually using it" signal |
| Completion rate | `completed sessions / tickets issued` | Did the flow finish cleanly |
| Repeat rate | `distinct plates with ≥ 2 sessions / distinct plates` | Habit formation |
| Registered vs guest split | sessions with / without `guest_user_id` | Where adoption comes from |
| Uncollected at close | completed sessions with no `PAID` payment | Revenue leakage |
| Exemption ratio | `EXEMPT` minor units / total minor units | Revenue leakage (exempt is not revenue) |
| Distinct guests ever parked | `count(distinct plate_digest)` | Real-world adoption, incl. non-registered owners |

## 7. Locked decisions

These are **settled**, not open. They are recorded as ADRs in `specs/decisions/`.

| # | Decision | ADR |
|---|---|---|
| L1 | Repo layout: `apps/web` + `apps/api` only. Single Next.js app with route groups; single NestJS app. Telegram is a **module inside** the NestJS API. The security-guards module is named `security-guards` (not `guards`) to avoid collision with `src/common/guards/`. | ADR-001 |
| L2 | Data layer: **Prisma 7**. | ADR-001, `data/schema.md` |
| L3 | **Claim activates.** A session becomes `ACTIVE` when the owner successfully claims the entry QR. A guard may manually activate or cancel a never-claimed pending session. The fee clock starts at claim. | ADR-004 |
| L4 | Pricing: configurable flat / hourly / tiered. Payment MVP: **manual cash recording with an audited reason**; no payment-provider integration. Payment status enum gains `VOIDED` — corrections to manual cash are explicit and audited, never silent edits. | ADR-005 |
| L5 | **Super admin** is a platform role with revenue + user/adoption visibility. Adoption is measured as real-world parking usage (owners who applied the system to a parking lot), which requires counting guest plates via `plate_digest`. | ADR-010, `features/admin-console/` |
| L6 | Camera / ANPR and barrier control are **out of scope**. | ADR-002 |

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Owner has no smartphone / no data | Owner cannot claim → session never activates | Guard can manually activate or cancel; guard training covers the case; a printed fallback reference is available for owner identification at exit |
| Screenshot sharing / ticket resale | Unauthorized exit | Backend always re-checks live session state; one ticket = one exit; plate is checked physically by the guard |
| Internet outage at a site | No entry/exit at all in the MVP | Documented outage procedure in `docs/incident-response.md`; offline capability designed but **not shipped** |
| Pricing disputes | Owner revenue disputes | Fee snapshot on the session at exit; pricing policy version stored on the session; reports show the version used |
| Manual cash errors | Wrong revenue | `VOIDED` state with audited reason; super-admin revenue report shows voided and exempt separately |
| Guard over-privilege | Cross-site access, revenue tampering | DB-backed fine-grained grants, site scope, immediate revocation via `authzVersion`, deny-by-default route audit |
| Guard account sharing | Lost attribution | Individual guard accounts, no shared logins, every audit row records the actor |
