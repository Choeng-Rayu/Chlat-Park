# Parking Sites

**Status:** In progress
**Requirement IDs:** PARK-001 … PARK-010
**Depends on:** `authentication`, `authorization`

---

## 1. Problem

A parking operation is a *site*, not an account. The same owner may run two lots a kilometre apart;
the same lot may have a different manager on the night shift. Every session, ticket, price, and
report is anchored to a site, and every permission is scoped to a site.

The guard's first action of every shift is to say **which** lot they are working. If that choice is
implicit, ambiguous, or inferred from a stale browser state, the wrong motorcycle can be admitted
to the wrong lot and priced at the wrong rate. The site must therefore be an **explicit, validated,
persisted selection** — and every site-scoped request must re-verify it server-side.

A site also carries the operational configuration that the rest of the system depends on: its
timezone, its currency, its pricing policy, its accepted payment methods, and how long an entry QR
may live.

## 2. Scope

### 2.1 In scope

* Creating, reading, updating and deactivating parking sites.
* One owner → many sites.
* Explicit site selection in the guard dashboard, persisted per guard.
* The site's operational configuration: timezone, currency, accepted payment methods, entry-claim
  TTL, grace period, and the "one active session per plate" policy.
* Listing the sites an actor may act on, filtered by the actor's scope.
* Site status transitions (`ACTIVE` → `DEACTIVATED`).
* The site scope being the anchor for every site-scoped permission.

### 2.2 Out of scope

* Geographic coordinates, map selection, or geofencing.
* Multi-tenant sub-sites within a lot (e.g. a basement level as a separate site).
* Multi-currency conversion between sites — each site has exactly one currency.
* Barcode, camera, or ANPR configuration.
* Site-level revenue sharing between owners.

## 3. Actors

| Actor | Interaction |
|---|---|
| Security guard | Selects the site they are working at; reads its settings |
| Parking owner | Creates and configures their own sites |
| Platform administrator | Creates sites for any owner; deactivates a site |
| Registered owner | None — a registered owner does not interact with sites directly |

## 4. Behaviour

1. A guard signs in. The dashboard asks which site they are working at.
2. The client requests the list of sites the guard is assigned to. The API returns only sites
   inside the guard's `assigned` scope.
3. The guard picks a site. The selection is stored client-side (session-scoped) and sent as
   `siteId` on every subsequent site-scoped request.
4. The API **never trusts** the `siteId` from the client: it re-verifies that the site is in the
   actor's scope on every request.
5. An owner creates a site with a name, an optional address, a timezone, a currency, and a set of
   accepted payment methods. The owner is set from the authenticated actor, not from the request
   body.
6. The owner updates the site's configuration. Changes to pricing are versioned separately
   (`features/pricing-and-payment/`); the site only points at the *effective* policy.
7. A super admin deactivates a site. Deactivation blocks new sessions. Existing sessions and their
   audit history are retained.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| PARK-001 | The system must require an explicitly selected site for every site-scoped operation, and must reject a site-scoped request that carries no resolvable target site. | P0 |
| PARK-002 | The API must verify, on every site-scoped request, that the target site is within the actor's resolved scope, and must reject the request with 403 `AUTHZ_SCOPE_DENIED` otherwise. The `siteId` supplied by the client must never be trusted without this check. | P0 |
| PARK-003 | A parking site must belong to exactly one owner. The owner must be derived from the authenticated actor when the site is created, and a client-supplied `ownerId` must be ignored by the owner-facing endpoint. | P0 |
| PARK-004 | A parking site must have a non-empty name of at most 120 characters, an optional address of at most 500 characters, a timezone that is a valid IANA identifier, and a currency that is a supported ISO-4217 code. | P0 |
| PARK-005 | A parking site must have exactly one currency, and all monetary amounts for its sessions must be expressed in that currency's minor units. | P0 |
| PARK-006 | A parking site must store the accepted payment methods for the site, and the set of methods offered on the exit screen must be exactly that set. | P0 |
| PARK-007 | The entry-claim time-to-live for a site must be configurable between 1 and 60 minutes and must default to 5 minutes. | P0 |
| PARK-008 | A parking site must support a per-site policy for concurrent sessions of the same normalized plate: either "allow multiple" or "one active session per plate", with "one active session per plate" as the default. The policy must be enforced at the site level, never globally. | P0 |
| PARK-009 | Listing sites must return only sites within the actor's scope, and must be paginated. | P0 |
| PARK-010 | Deactivating a site must prevent new parking sessions from being created at that site, must not delete existing sessions, tickets, payments, or audit records, and must be recorded in the audit log. | P0 |

## 6. Acceptance criteria

### Normal

* **PARK-001, PARK-002** — Given a guard assigned to site "S1", when the guard creates a session with
  `siteId = S1`, then the session is created at "S1" and the response contains "S1".
* **PARK-003** — Given owner "O1" is authenticated, when the owner creates a site and the request
  body contains `ownerId = O2`, then the created site has `owner_id = O1`.
* **PARK-004** — Given a valid IANA timezone "Asia/Phnom_Penh", when the site is created with
  `timezone = "Asia/Phnom_Penh"`, then the site is created with that timezone.
* **PARK-005** — Given a site with currency "USD", when a session at that site records a payment,
  then the payment currency is "USD" and the amount is in minor units.
* **PARK-007** — Given a site with the default configuration, when the site is read, then its entry
  claim TTL is 5 minutes.
* **PARK-008** — Given site "S1" has the policy "one active session per plate", when a guard
  creates a session for a plate that already has an `ACTIVE` session at "S1", then the request is
  rejected with 409 `PARK_DUPLICATE_ACTIVE_SESSION` and the existing session is unchanged.

### Failure

* **PARK-002** — Given a guard assigned to site "S1", when the guard creates a session with
  `siteId = S2`, then the response is 403 with `AUTHZ_SCOPE_DENIED` and no session is created.
* **PARK-001** — Given a request to a site-scoped endpoint without a resolvable site, then the
  response is 400 with `VALIDATION_FAILED`.
* **PARK-004** — Given a site creation request with `timezone = "Mars/Olympus"`, then the response
  is 400 with `VALIDATION_FAILED` naming the field.
* **PARK-010** — Given a deactivated site, when a guard tries to create a session there, then the
  response is 409 with `PARK_SITE_DEACTIVATED`.

### Abuse

* **PARK-002** — Given a guard assigned to site "S1", when the guard iterates site ids "S1".."S50"
  creating sessions, then every request for a site other than "S1" is rejected with
  `AUTHZ_SCOPE_DENIED` and no session is created.
* **PARK-009** — Given 25 sites exist across owners, when owner "O1" lists sites, then only "O1"'s
  sites are returned and the response is paginated.
* **PARK-003** — Given owner "O1" is authenticated, when the owner attempts to update site "S2"
  owned by "O2", then the response is 403 with `AUTHZ_SCOPE_DENIED`.
* **PARK-010** — Given a deactivated site with 100 historical sessions, when the deactivation is
  performed, then all 100 sessions and their audit rows still exist.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Should a site support a short code (e.g. "PPM-01") that a guard types instead of scrolling a list? | Product owner | Phase 2 |
| Q2 | What is the maximum number of sites one owner may hold? | Product owner | Phase 5 (see `authorization` Q2) |
| Q3 | Should deactivation be reversible (reactivation) in the MVP? | Product owner | Phase 5 |

## 8. Related

* `specs/features/parking-session/` — sessions belong to a site.
* `specs/features/pricing-and-payment/` — the effective pricing policy of a site.
* `specs/features/owner-management/` — site management from the owner console.
* `specs/data/schema.md` — the `parking_sites` model.
