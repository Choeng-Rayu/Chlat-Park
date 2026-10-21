# Chlat-Park — Personas and Roles

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`product-brief.md`](./product-brief.md) · [`../architecture/rbac-design.md`](../architecture/rbac-design.md) · [`../security/access-control-matrix.md`](../security/access-control-matrix.md)

---

## 1. Personas

### 1.1 Guest motorcycle owner — "Sok"

*Owns a Honda Dream, parks at a downtown lot twice a week, has no bank account, no app
installed, and no interest in registering.*

**Goals:** park quickly, know how much to pay, prove they parked here, leave.

**Can:**
* Claim an eligible entry session using the entry QR.
* View the ticket and the relevant parking details (site, plate, entry time, reference).
* Save the ticket page to the device (PWA) or save a screenshot.
* Present the ticket at exit.
* Optionally register or link an account later.

**Cannot:**
* Create or modify parking sessions.
* Change plate IDs, fees, payment status, or session status.
* Use a ticket to authorize more than one exit.

**Key constraint:** a guest ticket is never linked to an account merely because someone knows the
public ticket reference.

### 1.2 Registered motorcycle owner — "Bopha"

*Sok's colleague. Registered so that she can see her ticket history and recover tickets.*

**Can:** everything a guest can, plus:
* View ticket history associated with her account.
* Recover tickets from supported account-linked sessions.
* Manage account settings and link a Telegram identity.

**Cannot:** anything a guest cannot, plus she may not see or act on another owner's sessions.

**Key constraint:** account registration is never required to enter or leave parking.

### 1.3 Security guard — "Vichea"

*Works the day shift at one site. Uses a 24" monitor and a phone camera as a QR scanner. Handles
40–80 motorcycles per shift. Trained on paper tickets; new to tablets and mobile apps.*

**Can**, within assigned site(s) only:
* Sign in to the guard dashboard.
* Enter a plate ID and create a parking session.
* Display, reissue and cancel an entry QR.
* View active sessions for the site.
* Scan or manually enter an e-ticket reference at exit.
* Review plate, entry time, duration, fee, pricing-policy version and payment status.
* Record an authorized payment result or a manual exception.
* Complete an exit once all required checks pass.
* See connectivity and synchronization status.
* Open a manual review case.

**Cannot:**
* Access unrelated parking sites.
* Change global pricing or owner-level settings unless separately authorized.
* Delete audit records.
* Mark a payment as confirmed without the required evidence/process.

**Key constraint:** a guard is a person with a personal account, never a shared terminal login.

### 1.4 Parking owner / site manager — "Sokha"

*Runs two parking sites and employs three guards. Cares about revenue, disputes, and guard
turnover.*

**Can:**
* Manage assigned parking sites (name, address, timezone, currency, status).
* Configure pricing rules and site settings.
* Invite and deactivate guards, and assign a site role (`guard` | `manager`).
* View site sessions, payments and reports.
* Review manual overrides and audit logs for their sites.
* Configure which payment methods are accepted at their sites.
* Grant an exemption (reason required) and resolve a manual review case (reason required).

**Cannot:**
* See or manage another owner's sites, sessions, payments or reports.
* Create platform-level users or change platform configuration.
* Grant permissions beyond their own site scope.

### 1.5 Platform administrator — "Kanha" (super admin)

*Platform operator. Wants to know which parking lots actually adopted the system, how much
revenue the platform sees, and whether any site is misbehaving.*

**Can:**
* Manage owners and sites across the platform.
* Manage platform-level configuration.
* View platform revenue (collected / exempt / voided / failed) and adoption analytics.
* Investigate incidents, review audit trails, export audit data.
* Operate support and recovery workflows.

**Cannot:**
* Bypass the authorization check path — a super admin holds a *wider scope plus a full grant set*,
  it does not skip checks. Every super-admin action is still audited.

**Key constraint:** administrator access must be protected with strong authentication and audited.
Super-admin access to per-plate details is permission-gated and audit-logged.

---

## 2. The scope model

Scope is **data, not a code branch**. Two orthogonal axes:

* **Permission** — *what* an actor may do (dot-notation string, e.g. `site.exit.complete`).
* **Scope** — *where* the actor may do it (a set of site ids derived from their data).

| `scopeKind` | Site scope | Used by |
|---|---|---|
| `platform` | all sites | super admin |
| `owned` | sites where `parking_sites.owner_id` = this owner | parking owner |
| `assigned` | sites in `guard_site_assignments` | security guard |
| `self` | none (own resources only) | registered owner |

Full detail, including the enforcement mechanism, is in
[`../architecture/rbac-design.md`](../architecture/rbac-design.md).

### 2.1 The one rule that shapes all authorization code

> **There is no `if (isSuperAdmin) return allow` branch anywhere.**
> A super admin is a wider scope plus a full grant set, running through the *identical* check
> path. One check function serves every role.

### 2.2 Coarse vs fine authorization

| Layer | Source | Purpose | Change latency |
|---|---|---|---|
| Coarse | `users.role` (`super_admin \| owner \| guard \| user`) in the JWT | Cheap routing, role-gated navigation, coarse checks | Token lifetime |
| Fine | DB-backed `permissions` + `role_permissions` + `user_permission_grants` | The authoritative check on **every** request | Immediate (cache TTL 30 s, eagerly invalidated on writes) |

Fine-grained authorization is what makes revoking a guard's site assignment or a permission take
effect **immediately**, not when their token expires.

---

## 3. Role → scope → capability summary

| Role | `users.role` | `scopeKind` | Site access | Typical permissions |
|---|---|---|---|---|
| Platform administrator | `super_admin` | `platform` | all sites | `platform.*`, `site.*` (all), `account.*` |
| Parking owner | `owner` | `owned` | own sites | `site.settings.*`, `site.staff.*`, `site.pricing.*`, `site.reports.read`, `site.sessions.read`, `site.audit.read`, `site.payments.exempt`, `site.review.resolve` |
| Security guard | `guard` | `assigned` | assigned sites | `site.sessions.create`, `site.entry_qr.*`, `site.ticket.verify`, `site.exit.*`, `site.payments.record`, `site.review.open` |
| Registered owner | `user` | `self` | none | `account.tickets.read`, `account.telegram.link`, `ticket.claim` |
| Guest | *(no account)* | none | none | `ticket.claim` only (public, rate-limited) |

The authoritative role × permission × scope table is
[`../security/access-control-matrix.md`](../security/access-control-matrix.md).

---

## 4. Persona → journey → feature mapping

| Persona | Primary journeys | Feature specs |
|---|---|---|
| Guest owner | 4.2 website/PWA guest flow, 4.4 exit flow | `features/entry-qr-claim/`, `features/guest-ticket/`, `features/exit-verification/` |
| Registered owner | 4.2, 4.5 guest-to-account linking | `features/guest-ticket/`, `features/internationalization/` |
| Security guard | 4.1 entry flow, 4.4 exit flow | `features/authentication/`, `features/parking-sites/`, `features/parking-session/`, `features/entry-qr-claim/`, `features/exit-verification/`, `features/pricing-and-payment/` |
| Parking owner | Owner operations | `features/owner-management/`, `features/pricing-and-payment/`, `features/audit/` |
| Platform admin | Platform operations | `features/admin-console/`, `features/audit/`, `features/security/` |

---

## 5. Sign-in and session rules by persona

| Persona | Sign-in | Session lifetime | Notes |
|---|---|---|---|
| Security guard | Email + password | 12 h, sliding, re-auth for exit completion after 30 min idle | Shared terminals are forbidden |
| Parking owner | Email + password | 8 h | Sensitive actions (export, staff deactivation) require re-auth |
| Platform admin | Email + password (+ second factor required before release) | 4 h | Every admin action is audited; `platform.audit.export` is separately granted |
| Guest | none | n/a | Holds only an opaque claim token / ticket token |
| Registered owner | Email + password, or Telegram identity | 30 days with refresh | Telegram linking is optional |
