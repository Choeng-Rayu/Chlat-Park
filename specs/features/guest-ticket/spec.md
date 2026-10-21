# Guest Ticket

**Status:** In progress
**Requirement IDs:** TICKET-001 … TICKET-012
**Depends on:** `entry-qr-claim`

---

## 1. Problem

The e-ticket is what the owner shows at the exit, and it is often the only thing they will ever
look at. It has to survive being screenshotted, being shown on a cracked phone in daylight, and
being handed to a stranger. It also has to survive being **stolen** — a screenshot is a bearer
credential, and the system must never treat possession of one as proof of ownership.

That leads to the central tension of this feature:

* The ticket must be **portable** — a screenshot must work, because a guest with no account has
  no other way to keep it.
* The ticket must be **verifiable** — the backend must decide, at exit, whether the session it
  refers to is still valid and may be closed.

These are not in conflict. The QR identifies the ticket; the **server** decides whether the ticket
may authorize an exit. The ticket's own data is deliberately minimal.

Registration is optional throughout. A guest ticket may later be linked to an account — but only
with **proof of possession**, never because somebody knows the public reference.

## 2. Scope

### 2.1 In scope

* Issuing the e-ticket as part of the claim.
* The ticket token: opaque, unguessable, stored as a hash, returned once.
* The public reference: a short, human-typable code for manual entry at exit.
* The safe public ticket payload (site, plate, entry time, reference, instructions).
* The ticket display page: responsive, screenshot-friendly, printable, PWA-cacheable.
* Ticket states: `ISSUED`, `REVOKED`, `EXPIRED`.
* Retrieval of the safe ticket display data by reference.
* Optional guest → account linking, requiring proof of possession.
* Ticket history for a registered account.
* Revocation by staff with an audited reason.

### 2.2 Out of scope

* The exit decision itself (`exit-verification`).
* Telegram delivery of the ticket (`telegram-bot`).
* A signed offline ticket payload (deferred to the offline phase).
* Owner-to-owner ticket transfer, resale, or sharing.
* A "lost ticket" self-service recovery flow — deferred (see §7).

## 3. Actors

| Actor | Interaction |
|---|---|
| Guest motorcycle owner | Views the ticket, screenshots it, presents it at exit |
| Registered motorcycle owner | The same, plus ticket history and account linking |
| Security guard | Looks up a ticket by reference; revokes a ticket with a reason |
| Parking owner | Reviews ticket issues in the site report |

## 4. Behaviour

### 4.1 Issuance

The claim creates the ticket, the ticket token (returned once), and the public reference, all in
the claim's transaction.

### 4.2 Display

The ticket page shows:

* the parking site name and address,
* the plate ID,
* the entry timestamp (in the site's timezone),
* the ticket reference (typed form),
* a large QR code of the ticket token,
* short instructions in Khmer and English.

It deliberately does **not** show the fee — the fee is calculated at exit and may depend on a
pricing change, so the ticket shows no price. (The fee preview is a guard-side concern.)

### 4.3 Presentation at exit

The owner shows the QR. The guard's device scans it, or the guard types the reference. Either way
the system resolves the ticket and reads the **live** session state.

### 4.4 Linking to an account

A guest may register. To attach the guest ticket to the new account, the guest must present the
**ticket token** (the secret half of the QR), not the public reference. The linking must not
change the parking session, the ticket, or the payment history.

## 5. Requirements

| ID | Requirement | Priority |
|---|---|---|
| TICKET-001 | The system must issue exactly one ticket per parking session, enforced by a unique database constraint on `tickets.session_id`. | P0 |
| TICKET-002 | The ticket must carry two independent identifiers: an opaque ticket token of at least 128 bits of entropy stored as a hash and returned once, and a short public reference of at least 8 characters from an unambiguous alphabet, stored in the clear. | P0 |
| TICKET-003 | The public reference must be accepted at the exit scanner as a manual-entry fallback, and must be resolved to the ticket without exposing the ticket token. | P0 |
| TICKET-004 | The public ticket payload must contain only the site name, the plate ID, the entry timestamp, the ticket reference, the instructions, and the ticket token for the owner's own QR; it must not contain internal database identifiers, the pricing policy, the guard id, the plate digest, or any other person's data. | P0 |
| TICKET-005 | The ticket display must be responsive, must render legibly on a small phone screen in daylight, and must be screenshot-friendly: the full ticket must be visible in a single screenshot with no scrolling and no clipped QR code. | P0 |
| TICKET-006 | The ticket display page must set `Cache-Control: no-store` for authenticated responses and must not store the ticket token in `localStorage`, `sessionStorage`, IndexedDB, or a service-worker cache. | P0 |
| TICKET-007 | A ticket may be in exactly one of the states `ISSUED`, `REVOKED`, `EXPIRED`; a revoked or expired ticket must not authorize an exit. | P0 |
| TICKET-008 | Revoking a ticket must require an authorized actor and a reason, must be recorded in the audit log, and must not delete the ticket or its history. | P0 |
| TICKET-009 | Linking a guest ticket to an account must require proof of possession of the ticket token or a claim secret; knowledge of the public reference alone must never be sufficient. | P0 |
| TICKET-010 | Linking a guest ticket to an account must not modify the parking session, the ticket's issuance data, or the payment history. | P0 |
| TICKET-011 | A registered account's ticket list must return only tickets linked to that account, must be paginated, and must never return the ticket token for a ticket other than the one the caller is currently displaying. | P0 |
| TICKET-012 | The system must never treat possession of a screenshot as proof that the ticket is valid; the validity decision must be made against the live session state by the backend at the moment of the exit attempt. | P0 |

## 6. Acceptance criteria

### Normal

* **TICKET-001, TICKET-002** — Given a successful claim, when the response is inspected, then it
  contains a ticket token and a public reference, and the database stores the token hash and the
  reference in the clear.
* **TICKET-004** — Given a successful claim, when the ticket payload is inspected, then it contains
  the site name, the plate, the entry time, the reference, and the instructions, and nothing else.
* **TICKET-003** — Given a ticket reference, when a guard types it into the exit screen, then the
  system resolves the ticket and displays the session details.
* **TICKET-005** — Given a ticket on a 360×640 viewport, when the page is rendered, then the QR
  code is fully visible without scrolling and the reference is legible.

### Failure

* **TICKET-007** — Given a revoked ticket, when it is presented at the exit, then the result is
  `REVOKED` and exit is not authorized.
* **TICKET-008** — Given a ticket, when a guard revokes it without a reason, then the request is
  rejected with 400 and the ticket is not revoked.
* **TICKET-009** — Given a guest ticket, when a user tries to link it using only the public
  reference, then the request is rejected with 403 and the ticket remains a guest ticket.
* **TICKET-011** — Given an account with 3 tickets, when the account lists its tickets, then
  exactly 3 tickets are returned and no ticket token is included in the list response.

### Abuse

* **TICKET-012** — Given a ticket screenshot that is presented after the session was completed, then
  the verification result is `ALREADY_COMPLETED` and exit is not authorized.
* **TICKET-002** — Given 1000 issued tickets, when their public references are inspected, then all
  are distinct, all are at least 8 characters long, and none contains a character that is easily
  confused with another (no O/0, I/1, S/5, B/8).
* **TICKET-006** — Given the ticket page is loaded, when the browser storage is inspected, then no
  ticket token is present in local storage, session storage, IndexedDB, or the service-worker cache.
* **TICKET-009** — Given a guest ticket, when an unrelated user who knows the reference attempts to
  link it, then the attempt fails and an audit row records the failed linking attempt.
* **TICKET-010** — Given a guest ticket linked to an account, when the link is compared to the
  original, then the session id, the ticket's issued-at timestamp, and the payment rows are
  unchanged.

## 7. Open questions

| # | Question | Owner | Target |
|---|---|---|---|
| Q1 | Should the ticket show the current fee estimate, or remain price-free until exit? | Product owner | Phase 4 (current answer: price-free) |
| Q2 | What is the guest ticket recovery path when the owner loses the screenshot and has no account? | Product owner | Phase 4 |
| Q3 | Should a ticket be revocable by the owner (from the ticket page)? | Product owner | Phase 4 |
| Q4 | Is the ticket reference case-insensitive on entry? | Engineering | Phase 4 (current answer: case-insensitive, uppercased) |

## 8. Related

* `specs/features/entry-qr-claim/` — the claim that issues the ticket.
* `specs/features/exit-verification/` — the live session check.
* `specs/security/threat-model.md` — screenshot replay.
* `specs/architecture/offline-architecture.md` — the future signed ticket payload.
