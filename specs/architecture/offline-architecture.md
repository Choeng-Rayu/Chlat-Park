# Chlat-Park — Offline Architecture

> # ⛔ STATUS: DEFERRED — NOT IN THE MVP
>
> **This document describes a capability that is NOT shipped.**
>
> Chlat-Park's MVP is **online-first** (ADR-002). There is no local parking service, no offline
> ticket issuance, and no offline verification in the initial release. A site whose internet
> connection is down **cannot process entry or exit** — the operational procedure for that situation
> is in [`../../docs/incident-response.md`](../../docs/incident-response.md).
>
> This document is kept as the **design target** for the offline phase (Phase 6, ADR-003) so that
> the domain model, event contract, and key management can be designed now without committing to
> them in code.
>
> **Rules for this document**
> * Nothing here is a shipped requirement. The requirement IDs in `features/offline-sync/` are
>   `SYNC-*` and are all marked as deferred; they are **not** acceptance criteria for the MVP.
> * No UI may display "offline mode available", "works without internet", or similar. The MVP UI
>   states plainly that an internet connection is required.
> * A future release may only claim offline support after the local authority, the signed ticket
>   format, key rotation, the event queue, idempotent synchronization, and the conflict policy have
>   been **implemented and tested on the actual target hardware**, including a real network
>   disconnection and a restart/recovery test.

---

**Status:** Deferred (design target)
**Last updated:** 2026-10-21
**Related:** ADR-002, ADR-003, ADR-008, [`../features/offline-sync/`](../features/offline-sync/)

---

## 1. Why offline exists

A parking site that cannot admit motorcycles during an internet outage cannot operate at all. A
single VPS and a single uplink make the whole platform a single point of failure (see
[`deployment.md`](./deployment.md) §2). The local parking service is the answer: a small, site-local
application that **becomes the trusted authority** when the central backend is unreachable, keeps
issuing and verifying tickets locally, and reconciles with the central backend when the link
returns.

**The hard part is not the local database.** It is that a disconnected system cannot ask anyone
whether a ticket is still valid, and cannot revoke a ticket that was stolen while offline. The
design below is explicit about those limits rather than glossing over them.

## 2. Two operating modes

| Mode | Description | MVP? |
|---|---|---|
| **Online-first** | The central backend is the only authority. The web app may cache a previously loaded ticket for display, but it cannot issue a first-time ticket or validate a ticket authoritatively while disconnected. | ✅ Shipped |
| **Full offline** | A site-local service is the authority for its site during a declared outage. It issues, verifies, and queues events; it reconciles later. | ⛔ Deferred |

**The MVP boundary, stated precisely:**

* The PWA **may** cache static assets and a previously loaded ticket's *display* data, so an owner
  can still read their plate, site, and entry time while offline.
* The PWA **must not** present a cached ticket as "valid" — verification always round-trips to the
  authority, online or local.
* The system **must not** promise first-time website access while fully offline.

## 3. Target topology

```
        Internet (up)                     Internet (down)
   ┌──────────────────────┐          ┌──────────────────────┐
   │ Central backend      │          │ Central backend      │
   │ (VPS) + PostgreSQL   │          │ (unreachable)        │
   └───────────▲──────────┘          └───────────▲──────────┘
               │ HTTPS                              │ (no link)
               │                                   ╳
   ┌───────────┴───────────┐          ┌───────────┴───────────┐
   │ Site LAN              │          │ Site LAN              │
   │  ┌──────────────────┐  │          │  ┌──────────────────┐  │
   │  │ Local parking    │  │◀────────▶│  │ Local parking    │  │
   │  │ service          │  │  sync    │  │ service          │  │
   │  │  - Local API     │  │  (queue) │  │  - Local API     │  │
   │  │  - Local DB      │  │          │  │  - Local DB      │  │
   │  │  - Event queue   │  │          │  │  - Event queue   │  │
   │  │  - Sync worker   │  │          │  │  - Sync worker   │  │
   │  │  - Signing keys  │  │          │  │  - Signing keys  │  │
   │  └────────┬─────────┘  │          │  └────────┬─────────┘  │
   │           │            │          │           │            │
   │      Guard monitor      │          │      Guard monitor      │
   │      (browser)          │          │      (browser)          │
   └──────────────────────────┘          └──────────────────────────┘
```

**Recommended model (ADR-003): one designated local authority per site.** A second independent
offline device at the same site would be able to authorize the same ticket twice with no way to
coordinate, so the first release forbids it. The local service is a single instance per site; the
monitor talks to it over the site LAN.

## 4. Local parking service responsibilities

| Responsibility | Detail |
|---|---|
| Local API | Entry QR issuance, claim, ticket issuance, exit verification, fee calculation — the **same** domain rules as the central backend, running against the local database |
| Local database | Sessions, claims, tickets, payments, and a local event outbox |
| Site configuration | Site id, pricing policy, currency, timezone, allowed guard identities |
| Verification logic | Validates a ticket **offline** against the local session state and a signed payload |
| Event queue | An append-only outbox of domain events awaiting synchronization |
| Sync worker | Drains the queue to the central backend, handles accepted/duplicate/rejected/conflict |
| Restart recovery | On boot, the service reconciles its queue, finishes in-flight transactions, and resumes syncing |
| Health and sync status | Exposed to the monitor: `online` / `degraded` / `offline`, plus the sync backlog depth and last successful sync time |

## 5. Offline event synchronization contract

Every offline event carries:

| Field | Type | Notes |
|---|---|---|
| `eventId` | UUID | **Globally unique.** The deduplication key. |
| `siteId` | UUID | The site the event belongs to |
| `localAuthorityId` | string | Identifies the device/process that produced the event |
| `entityRef` | `{ type, id }` | The session, ticket, or payment the event concerns |
| `eventType` | enum | e.g. `session.created`, `session.activated`, `ticket.issued`, `payment.recorded`, `session.completed` |
| `createdAtLocal` | ISO-8601 UTC | When the event was produced locally |
| `sequenceNumber` | integer | Monotonic per local authority; detects gaps and out-of-order delivery |
| `payload` | object | The event payload, schema-versioned |
| `schemaVersion` | integer | Payload shape version |
| `integrity` | object | HMAC over the canonical event body, keyed by the shared local-authority secret |

### 5.1 Central processing requirements

The central backend **must**:

1. **Authenticate** the local authority (shared secret or client certificate per site; the secret is
   rotated and stored in the deployment secret store).
2. **Deduplicate** by `eventId` — a repeated `eventId` returns `duplicate` and applies no effect.
3. **Validate** the allowed state transition for the event type.
4. **Apply** the event **transactionally**.
5. **Return** one of `accepted | duplicate | rejected | conflict`.
6. **Preserve conflict details** for review (never silently drop them).
7. Allow **safe retry** without duplicating a session or a payment.

### 5.2 Response envelope

```json
{
  "results": [
    { "eventId": "…", "status": "accepted" },
    { "eventId": "…", "status": "duplicate" },
    { "eventId": "…", "status": "rejected", "code": "INVALID_TRANSITION", "details": { "from": "ACTIVE", "to": "PENDING_CLAIM" } },
    { "eventId": "…", "status": "conflict", "code": "CENTRAL_STATE_AHEAD", "details": { "centralStatus": "COMPLETED", "localStatus": "ACTIVE" } }
  ],
  "serverTime": "2026-10-21T09:12:44.120Z"
}
```

HTTP status is `200` for a processed batch (individual results carry the per-event status), `400`
for a malformed batch, `401`/`403` for an unauthenticated or unauthorized authority.

## 6. Conflict policy

| Rule | Detail |
|---|---|
| **No silent overwrite** | The central backend must never overwrite central state with stale local state without an explicit, audited resolution. |
| **Authority during an outage** | The local authority **is** authoritative for its site while an outage is declared, subject to its configured policy. |
| **Out-of-order / conflicting events** | Flagged for reconciliation (`sync_status = 'conflict'`, `conflict_details` populated). |
| **Double authorization** | Two offline devices must not independently authorize the same ticket. One local authority per site prevents this; the central backend additionally rejects a `session.completed` event for a session that is already `COMPLETED`. |
| **Offline payment** | Recorded as `PENDING` / **unverified** unless the payment method itself provides a reliable offline confirmation mechanism. In the MVP (manual cash), offline cash payments are recorded as `PENDING` and reconciled to `PAID` by a human action at the central side, or left `PENDING` if unreconciled. |

### 6.1 Reconciliation states on `sync_events`

| `sync_status` | Meaning | Next action |
|---|---|---|
| `pending` | Queued locally, not yet delivered | Sync worker retries |
| `delivered` | Accepted by the central backend | None |
| `duplicate` | Rejected as a duplicate; the effect already exists | None |
| `rejected` | The central backend refused the event (invalid transition, unknown entity) | Review |
| `conflict` | The event conflicts with central state | Reconciliation task; a human resolves |
| `failed` | Transport failure; the event will be retried | Automatic retry with backoff |

## 7. Offline ticket format (signed payload)

For offline verification the ticket must carry a verifiable signature, because the verifier must
decide without asking the central backend.

```
payload (v1):
{
  "v": 1,
  "tid": "<ticket id>",
  "sid": "<session id>",
  "site": "<site id>",
  "iat": 1758432000,
  "exp": 1758518400,
  "plateDigest": "<hmac of the normalized plate>",
  "kid": "key-2026-01"
}
```

* Signed with Ed25519 (or ECDSA P-256) using a **per-site or per-authority signing key**.
* The signature covers the canonical JSON serialization of the payload.
* **Minimum claims only** — no owner name, no phone number, no readable plate.
* The local verifier checks: signature valid, key id known and not revoked-locally, `exp` not
  passed, **and** the local session state allows exit. The signature proves who issued the
  ticket; the session state decides whether the ticket may be used.

### 7.1 Key management rules

| Rule | Detail |
|---|---|
| Private keys | Kept on the trusted backend / local-service infrastructure only. **Never** in a browser, never in the PWA cache, never in a Git repository. |
| Distribution | Only **verification** keys are distributed to verifiers. |
| Key IDs | Every signed payload carries a `kid` so a verifier knows which key to use. |
| Rotation | New key id, new key pair; the old key remains valid for verification until its `notAfter` passes. |
| Delivery of key updates | The local service receives new verification keys over the authenticated sync channel, out of band from the event stream. |
| Emergency revocation | A local service **may** be told to stop accepting a key id. During a total disconnection it **cannot** learn about a revocation issued elsewhere. |
| Honest revocation claim | While disconnected, Chlat-Park **does not claim** global revocation. The UI and the runbook state this plainly. |

## 8. Restart and recovery

| Scenario | Required behaviour |
|---|---|
| Service restart mid-transaction | The transaction rolls back; the session returns to its previous state; the event is re-emitted by the local outbox, which is written in the same transaction as the state change. |
| Service restart with a queued backlog | On boot the service reads the outbox, resumes syncing, and reports the backlog depth and the last successful sync time. |
| Outbox partially synced | Events already acknowledged are not re-sent; the rest are, and the central backend deduplicates by `eventId` anyway. |
| Clock skew | The local service records `createdAtLocal` in UTC and a monotonic `sequenceNumber`; ordering decisions use the sequence number, never the wall clock. |
| Duplicate local device | The site is configured with exactly one `localAuthorityId`. A second device presenting a different id is rejected by the central backend and surfaced in the health view. |

## 9. Guard-facing behaviour during an outage (future)

| Action | Behaviour |
|---|---|
| Entry | The local service issues a session and an entry QR; the owner claims against the local service. |
| Exit | The local service verifies the ticket against local state and completes the session locally. |
| Payment | Recorded as `PENDING`; the guard sees "will be reconciled". |
| Sync status | The monitor shows `OFFLINE — operating locally`, the backlog depth, and the time of the last successful sync. |
| Escalation | The guard follows the outage procedure in `docs/incident-response.md`; the local authority cannot be "patched" remotely while disconnected. |

## 10. Open / deferred sub-decisions

| # | Question | Status |
|---|---|---|
| D1 | Hardware: mini PC, local server, or a reused desktop? | Deferred — hardware selection is a Phase 6 task |
| D2 | Physical placement and network topology of the local service | Deferred |
| D3 | Whether the guard browser talks to the local service directly or through a reverse proxy on the LAN | Deferred |
| D4 | Key distribution channel and cadence | Deferred |
| D5 | Retention of local data after reconciliation (how long does the local DB keep history?) | Deferred |
| D6 | Whether offline cash payments are reconciled automatically or always by a human | Deferred |
| D7 | Whether the central backend may *reject* an offline event outright, or must always accept-and-flag | Deferred — the current design allows both, configurable per site |

These are recorded in ADR-003.

## 11. Phase 6 exit criteria (the bar for claiming offline support)

* Documented offline scenarios pass **on the actual target hardware**.
* A real network disconnection test passes (not a mocked failure).
* A restart/recovery test passes.
* Duplicate, out-of-order, and conflicting events are handled and demonstrable.
* Key rotation is exercised, including the "old key still valid until `notAfter`" window.
* Sync health is visible in the guard UI.
* Reconciliation tooling exists for `conflict` rows.
* **No unsupported claim of global revocation while disconnected** appears in the UI, the docs, or
  the sales material.
