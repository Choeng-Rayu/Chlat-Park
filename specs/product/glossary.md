# Chlat-Park — Glossary

**Status:** Accepted
**Last updated:** 2026-10-21
**Related:** [`product-brief.md`](./product-brief.md)

---

## 1. Domain terms

| Term | Definition | Notes |
|---|---|---|
| **Parking owner** | Business or person responsible for a parking operation. | Maps to `users.role = owner`; owns 1..N parking sites. |
| **Parking site** | A physical parking location managed by an owner. | The unit of scope for all site-scoped permissions. |
| **Security guard** | Staff member authorized to create sessions and verify exits at assigned sites. | Module name `security-guards`; DB model `SecurityGuard`; `users.role = guard`. |
| **Guard site assignment** | The link between a guard and a site, with a site role (`guard` \| `manager`). | Source of the `assigned` scope. |
| **Plate ID** | Motorcycle registration plate identifier entered by a guard. | Stored twice: `plate_id_original` (as typed) and `plate_id_normalized`. |
| **Normalized plate** | The canonical form of a plate after ADR-007 normalization. | Khmer and Latin letters and digits are preserved verbatim; never transliterated. |
| **Plate digest** | `HMAC-SHA256(server_pepper, normalized_plate)`. | Non-reversible, indexed, used for lifetime distinct-guest counting. |
| **Parking session** | A single motorcycle visit, from entry to exit. | The aggregate root of the product. |
| **Session status** | `PENDING_CLAIM \| ACTIVE \| EXIT_PENDING \| COMPLETED \| CANCELLED \| MANUAL_REVIEW`. | See `features/parking-session/design.md`. |
| **Entry QR** | Short-lived QR displayed on the guard's monitor so an owner can claim a session. | Identifies a **claim operation**. It never authorizes exit. |
| **Entry claim** | The server-side record of a pending claim (token hash, expiry, claimed/revoked timestamps). | Model `entry_claims`. |
| **Claim token** | 256-bit cryptographically random opaque token issued for an entry claim. | Returned once at issuance; stored only as a SHA-256 hash (ADR-008). |
| **E-ticket** | Ticket issued for a parking session and shown by the owner at exit. | Model `tickets`; carries `public_reference` and a `token_hash`. |
| **Ticket reference** | The short human-typable code shown on the ticket and entered manually at exit. | E.g. `7K3M-9QX4`. Not the internal primary key. |
| **Ticket token** | The long opaque bearer secret encoded in the ticket QR. | Returned once at issuance; stored only as a hash. |
| **Guest** | Owner using a ticket without registering an account. | The normal case. Has no `users` row. |
| **Ticket claim secret** | Proof-of-possession value used to link a guest ticket to an account. | Never derivable from the public reference alone. |
| **Local parking service** | Optional site-local application/database that acts as the trusted authority during internet outages. | **Deferred** — not shipped in the MVP. |
| **Central backend** | NestJS service deployed on the VPS; the source of truth while online. | `apps/api`. |
| **Offline event** | A locally recorded state change waiting to synchronize with the central backend. | Model `sync_events`. **Deferred.** |
| **Local authority** | The identity of the site-local service that produced offline events. | `local_authority_id` on `sync_events`. **Deferred.** |

## 2. Commercial / pricing terms

| Term | Definition |
|---|---|
| **Pricing policy** | A versioned, per-site rule set used to calculate the parking fee. |
| **Pricing policy version** | The integer version of a pricing policy. Stored on the session so history is never re-priced. |
| **Fee** | The amount owed for a session, in integer minor units. |
| **Minor unit** | The smallest indivisible currency unit (e.g. cents). All money is integer minor units. |
| **Fee snapshot** | `fee_amount_minor` / `fee_currency` written on the session at exit completion. Makes historical revenue stable. |
| **Fee clock** | The period the fee is calculated over. **Starts at claim** (ADR-004), not at plate entry. |
| **Uncollected at close** | A completed session with no `PAID` payment. Reported separately from revenue. |
| **Exemption** | A waived fee. Records who authorized it and why. Not revenue, but is revenue leakage. |
| **Voided payment** | A previously recorded payment that has been corrected. `VOIDED` subtracts from revenue; never a silent delete. |
| **Revenue** | The sum of `PAID` payments in the window. `EXEMPT` and `VOIDED` are reported separately, never folded into revenue. |

## 3. Authorization terms

| Term | Definition |
|---|---|
| **Permission** | A dot-notation capability string, e.g. `site.exit.complete`. The "what". |
| **Scope** | The set of sites an actor may act on. The "where". |
| **`scopeKind`** | `platform` \| `owned` \| `assigned` \| `self`. |
| **Role** | Coarse classification on `users.role`: `super_admin \| owner \| guard \| user`. |
| **Grant** | A per-user override of a role permission: `UserPermissionGrant` with effect `GRANT` or `REVOKE`. |
| **`authzVersion`** | Integer on `users`, bumped on any permission/assignment change. Used to invalidate caches. |
| **Deny-by-default** | A route with neither `@RequirePermissions(...)` nor `@Public()` returns 403. There is no implicit-allow path. |
| **`@Public()`** | The only opt-out from the permission check, on an explicit allowlist reviewed in the threat model. |
| **Super admin** | A platform role with a wider scope and a full grant set. **Not** a bypass of the check path. |
| **Fine-grained authorization** | DB-backed permission resolution executed on every request. |
| **Route audit** | A CI test that enumerates the NestJS route table and fails if any route lacks `@RequirePermissions` or `@Public()`. |

## 4. States

### 4.1 Parking session states

| State | Meaning |
|---|---|
| `PENDING_CLAIM` | Session created by a guard; waiting for the owner to claim the entry QR. Fee clock **not** running. |
| `ACTIVE` | Claimed (or manually activated). Fee clock running. |
| `EXIT_PENDING` | Exit authorized in progress; awaiting completion. |
| `COMPLETED` | Exit completed. Terminal. The ticket is spent. |
| `CANCELLED` | Session abandoned before activation. Terminal. |
| `MANUAL_REVIEW` | An exception was opened. Requires an authorized, audited resolution. |

### 4.2 Ticket states

| State | Meaning |
|---|---|
| `ISSUED` | Ticket exists and is linked to a session. Not sufficient on its own to authorize exit. |
| `REVOKED` | Ticket was invalidated by staff or by session cancellation. |
| `EXPIRED` | Ticket exceeded its validity window. |

### 4.3 Payment states

| State | Meaning |
|---|---|
| `UNPAID` | No payment recorded. |
| `PENDING` | Payment initiated or claimed but not confirmed. |
| `PAID` | Payment confirmed. Counts as revenue. |
| `FAILED` | Payment attempt failed. |
| `EXEMPT` | Fee waived by an authorized actor with a recorded reason. |
| `VOIDED` | Payment record corrected or reversed. Subtracts from revenue; audited. |

## 5. Technical terms

| Term | Definition |
|---|---|
| **Server pepper** | Server-side secret mixed into the plate HMAC. Rotation breaks historical digest continuity (ADR-010). |
| **Idempotency key** | A client-supplied key that lets a retried write produce the same effect exactly once. |
| **Request ID** | Correlation identifier returned on every API response and attached to every log line. |
| **Consistent error code** | A stable machine-readable error identifier returned in the error envelope. |
| **OpenAPI drift check** | CI job that regenerates the contract and fails if the committed `specs/api/openapi.yaml` differs. |
| **Guard dashboard** | The Next.js route group serving the guard monitor experience. |
| **Owner experience** | The Next.js route group serving the guest/registered owner ticket experience. |
| **PWA** | Progressive web app: the owner ticket page, installable and cacheable for a previously loaded ticket. |
