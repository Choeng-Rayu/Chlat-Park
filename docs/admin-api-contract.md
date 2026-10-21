# Admin Console — API Contract

> **This document is the contract between the two halves of the team.**
>
> `vireaboth` builds the admin console (the frontend). `kitya` builds the API
> endpoints it calls. This file is what both sides code against, so the two
> halves cannot drift apart. **A change to a shape in this file is a change to
> the contract, and it lands in `packages/contracts` first** — see
> [`TEAM-WORKFLOW.md`](./TEAM-WORKFLOW.md) §4.

**Status:** Agreed
**Requirement IDs:** ADMIN-001 … ADMIN-014
**Owner of the API side:** kitya
**Owner of the console side:** vireaboth
**Source of truth:** [`specs/features/admin-console/spec.md`](../specs/features/admin-console/spec.md) ·
[`specs/features/admin-console/design.md`](../specs/features/admin-console/design.md) ·
[`specs/architecture/rbac-design.md`](../specs/architecture/rbac-design.md) ·
[`specs/security/access-control-matrix.md`](../specs/security/access-control-matrix.md)

---

## 1. The general shape

### 1.1 The base URL and the prefix

```
http://localhost:3001/api/v1
```

`API_PORT` is 3001 in development, `API_URL` is the deployment base URL. The
console calls the API **server-side** (Next.js server components and server
actions), not from the browser, so the cookie is forwarded and the access
token never reaches the client bundle.

### 1.2 The envelope

Every response — success or failure — has the same shape.

**Success (200/201):**

```json
{
  "success": true,
  "data": { "…": "the payload" },
  "message": null,
  "error": null
}
```

**Failure (4xx/5xx):**

```json
{
  "success": false,
  "data": null,
  "message": "The request payload is invalid.",
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request payload is invalid.",
    "details": [{ "path": "from", "code": "invalid_date", "message": "…" }],
    "requestId": "01JB9Z0K8Q4M2N7P3R5T6V8W9X"
  }
}
```

`error.code` is **stable** and is what the console branches on. `error.message`
is for humans and may be reworded. `error.requestId` is the correlation id —
show it in an error toast so a support request can be traced.

### 1.3 Authentication

The access token is an **HttpOnly cookie** (`chlat_at`), set by
`POST /api/v1/auth/login`. The console reads it server-side and forwards it:

```
Authorization: Bearer <accessToken>
```

The console calls `GET /api/v1/auth/me` on load to learn the actor's role,
scope kind and effective permissions. The console hides an action the actor
cannot perform; **the API still decides** (RBAC-004, "hiding a button is UX,
not authorization").

### 1.4 The scope

Every endpoint below is **platform-scoped**: a super admin sees every site.
A non-super-admin never holds a `platform.*` permission, so a 403 is the
answer for them — not a 404 and not an empty list.

### 1.5 The time range

Every platform-wide query is bounded (ADMIN-014):

| Rule | Value |
|---|---|
| Maximum range | **366 days** |
| Bounds | `from` inclusive, `to` exclusive |
| Default | The last 30 days |
| Over the limit | `400 VALIDATION_FAILED` |

The console must limit its own date picker to 366 days, and must handle the
400 anyway — the API is the authority.

### 1.6 The currency

Revenue is reported in **integer minor units** (`…Minor`). The currency code
comes from the site; a platform with sites in two currencies reports each
site in its own currency, and the console must **not** add them together
across currencies.

---

## 2. `GET /admin/revenue` — the revenue panel

**Permission:** `platform.revenue.read`
**Purpose:** ADMIN-001, ADMIN-002, ADMIN-003

### 2.1 Query parameters

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `from` | ISO-8601 date-time | yes | last 30 days | Inclusive. |
| `to` | ISO-8601 date-time | yes | now | Exclusive. |
| `siteId` | UUID | no | all sites | Repeatable (`?siteId=a&siteId=b`). |
| `ownerId` | UUID | no | all owners | Filter to one owner's sites. |
| `currency` | ISO-4217 | no | the site's | Filter to one currency. |

### 2.2 The response

```json
{
  "success": true,
  "data": {
    "from": "2026-09-01T00:00:00.000Z",
    "to": "2026-10-01T00:00:00.000Z",
    "currency": "USD",

    "collectedMinor": 1284500,
    "exemptMinor": 42500,
    "voidedMinor": 15000,
    "failedCount": 7,
    "uncollectedMinor": 32000,
    "uncollectedSessionCount": 4,

    "exemptRatio": 0.0313,
    "voidedRatio": 0.0114,

    "uncapturedPaymentCount": 2,
    "uncapturedMinor": 8000,

    "bySite": [
      {
        "siteId": "7c1f6b0e-6c4a-4f39-9a1a-2d3e4f5a6b7c",
        "siteName": "Central Market Lot",
        "ownerId": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        "ownerName": "Sok Chea",
        "currency": "USD",
        "collectedMinor": 845000,
        "exemptMinor": 25000,
        "voidedMinor": 10000,
        "failedCount": 3,
        "uncollectedMinor": 20000,
        "uncollectedSessionCount": 2
      }
    ],

    "byOwner": [
      {
        "ownerId": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        "ownerName": "Sok Chea",
        "currency": "USD",
        "siteCount": 3,
        "collectedMinor": 845000,
        "exemptMinor": 25000,
        "voidedMinor": 10000,
        "failedCount": 3,
        "uncollectedMinor": 20000,
        "uncollectedSessionCount": 2
      }
    ],

    "timeSeries": [
      { "period": "2026-09-01", "collectedMinor": 410000, "exemptMinor": 12000, "voidedMinor": 5000, "failedCount": 2, "uncollectedMinor": 15000 },
      { "period": "2026-09-08", "collectedMinor": 455000, "exemptMinor": 18500, "voidedMinor": 7000, "failedCount": 3, "uncollectedMinor": 17000 },
      { "period": "2026-09-15", "collectedMinor": 419500, "exemptMinor": 12000, "voidedMinor": 3000, "failedCount": 2, "uncollectedMinor": 0 }
    ]
  },
  "message": null,
  "error": null
}
```

### 2.3 What each figure means

| Field | Definition | SQL source |
|---|---|---|
| `collectedMinor` | `SUM(amount_minor) WHERE status = 'PAID'` | `specs/architecture/rbac-design.md` §9.1 |
| `exemptMinor` | `SUM(amount_minor) WHERE status = 'EXEMPT'` | same |
| `voidedMinor` | `SUM(amount_minor) WHERE status = 'VOIDED'` | same |
| `failedCount` | `COUNT(*) WHERE status = 'FAILED'` — a **count**, not money | same |
| `uncollectedMinor` | `SUM(fee_amount_minor)` over `COMPLETED` sessions with **no** `PAID` payment | §9.2 |
| `uncollectedSessionCount` | `COUNT(*)` over the same set | §9.2 |
| `exemptRatio` | `exemptMinor / (collectedMinor + exemptMinor + voidedMinor)` | §9.6 |
| `voidedRatio` | `voidedMinor / (collectedMinor + exemptMinor + voidedMinor)` | §9.6 |
| `uncapturedPaymentCount` | Payments in the window with `captured_at IS NULL` and `status <> 'VOIDED'` | §9.1 caveat |
| `uncapturedMinor` | The sum of those payments | same |

### 2.4 The three rules the console must not break

1. **`EXEMPT` and `VOIDED` are separate, prominent figures.** They are
   revenue *leakage* and *corrections*. They must never be netted into
   `collectedMinor`, and they must never be hidden inside a single "total".
   The console shows them as their own cards, next to "Collected", with the
   exemption ratio visible.

2. **The uncaptured warning is visible.** When `uncapturedPaymentCount > 0`,
   the console shows a warning banner. A payment that was recorded but never
   captured would otherwise silently vanish from the report, because the
   revenue query filters on `captured_at`.

3. **Nothing is added across currencies.** `bySite` and `byOwner` may contain
   rows in different currencies. The console groups by currency and never
   sums across them.

### 2.5 The errors

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | The range is longer than 366 days, or `from >= to`, or a malformed date. `details` names the field. |
| 401 | `AUTH_TOKEN_EXPIRED` | The access token expired — refresh and retry. |
| 403 | `AUTHZ_PERMISSION_DENIED` | The actor does not hold `platform.revenue.read`. |
| 429 | `RATE_LIMITED` | Too many requests. Honour `Retry-After`. |
| 503 | `SERVICE_UNAVAILABLE` | The report query timed out. Narrow the range and retry. |

---

## 3. `GET /admin/adoption` — the adoption panel

**Permission:** `platform.analytics.read`
**Purpose:** ADMIN-004 … ADMIN-010

### 3.1 Query parameters

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `from` | ISO-8601 date-time | yes | last 30 days | Inclusive. |
| `to` | ISO-8601 date-time | yes | now | Exclusive. |
| `siteId` | UUID | no | all sites | Repeatable. |
| `ownerId` | UUID | no | all owners | |
| `granularity` | `day` \| `week` \| `month` | no | `day` | The period of the trend series. |

### 3.2 The response

```json
{
  "success": true,
  "data": {
    "from": "2026-09-01T00:00:00.000Z",
    "to": "2026-10-01T00:00:00.000Z",

    "registeredUserCount": 50,
    "distinctGuestCount": 300,
    "activeUserCount": 271,

    "funnel": {
      "sessionsCreated": 1000,
      "claimsIssued": 940,
      "ticketsIssued": 900,
      "sessionsCompleted": 800,
      "claimRate": 0.9,
      "completionRate": 0.8
    },

    "repeatRate": 0.25,
    "repeatPlateCount": 75,

    "registeredVsGuest": {
      "registeredSessions": 320,
      "guestSessions": 680
    },

    "bySite": [
      {
        "siteId": "7c1f6b0e-6c4a-4f39-9a1a-2d3e4f5a6b7c",
        "siteName": "Central Market Lot",
        "ownerId": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        "ownerName": "Sok Chea",
        "sessionsCreated": 420,
        "ticketsIssued": 395,
        "sessionsCompleted": 350,
        "registeredUserCount": 12,
        "distinctGuestCount": 118,
        "activeUserCount": 104,
        "claimRate": 0.9405,
        "completionRate": 0.8861,
        "repeatRate": 0.2542
      }
    ],

    "byOwner": [
      {
        "ownerId": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        "ownerName": "Sok Chea",
        "siteCount": 3,
        "sessionsCreated": 1180,
        "ticketsIssued": 1102,
        "sessionsCompleted": 980,
        "registeredUserCount": 28,
        "distinctGuestCount": 331,
        "activeUserCount": 299,
        "claimRate": 0.9339,
        "completionRate": 0.8893,
        "repeatRate": 0.2613
      }
    ],

    "monthlyTrend": [
      { "period": "2026-07", "newDistinctPlates": 42, "sessions": 210, "ticketsIssued": 195, "sessionsCompleted": 170 },
      { "period": "2026-08", "newDistinctPlates": 61, "sessions": 340, "ticketsIssued": 312, "sessionsCompleted": 275 },
      { "period": "2026-09", "newDistinctPlates": 88, "sessions": 450, "ticketsIssued": 425, "sessionsCompleted": 355 }
    ]
  },
  "message": null,
  "error": null
}
```

### 3.3 What each figure means

| Field | Definition | SQL source |
|---|---|---|
| `registeredUserCount` | `COUNT(users WHERE role = 'user' AND status <> 'suspended')` | §9.5 |
| `distinctGuestCount` | `COUNT(DISTINCT plate_digest)` over the sessions in the period | §9.5 |
| `activeUserCount` | The **union** of distinct `plate_digest` and distinct `guest_user_id` in the period | §9.5 |
| `funnel.sessionsCreated` | `COUNT(parking_sessions)` in the period | §9.6 |
| `funnel.claimsIssued` | `COUNT(entry_claims)` in the period | §9.6 |
| `funnel.ticketsIssued` | `COUNT(tickets)` in the period | §9.6 |
| `funnel.sessionsCompleted` | `COUNT(sessions WHERE status = 'COMPLETED' AND exit_at IN period)` | §9.6 |
| `funnel.claimRate` | `ticketsIssued / sessionsCreated` | §9.6 |
| `funnel.completionRate` | `sessionsCompleted / ticketsIssued` | §9.6 |
| `repeatRate` | `distinct plates with ≥2 sessions / distinct plates` | §9.6 |
| `registeredVsGuest` | The split of sessions by `guest_user_id IS NULL` | §9.6 |
| `monthlyTrend` | `date_trunc('month', created_at)` → new distinct plates + session counts | §9.6 |

### 3.4 The privacy rules — these are not optional

1. **No `plate_digest` is ever returned.** Not in the adoption panel, not in
   the per-site breakdown, not in the trend. The digest is a counting
   instrument; it never leaves the database (ADMIN-004, ADMIN-010).

2. **No raw plate list, ever.** Every shape above is an aggregate or a
   per-site breakdown. There is no endpoint that returns a list of plates.

3. **The count is of *distinct plates*, not of *people*.** A person with two
   motorcycles counts twice. The console must label the figure
   "distinct guests" / "distinct plates", never "users" or "customers" —
   the number means something different.

4. **Registration is optional.** The majority of usage is by guests. A
   console that shows only `registeredUserCount` reports a product that
   looks unused. The three counts (registered, distinct guests, active) are
   always shown together.

5. **The pepper may rotate.** When the `PLATE_PEPPER` version changes, the
   historical `plate_digest` values no longer match. The response carries
   `digestContinuity: "broken" | "intact"` and the console shows a warning
   when it is `"broken"` (ADR-010).

### 3.5 The errors

Same as §2.5, plus:

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | The range exceeds 366 days, or `granularity` is not one of the three values. |
| 403 | `AUTHZ_PERMISSION_DENIED` | The actor does not hold `platform.analytics.read`. |

---

## 4. `GET /admin/sites` — the platform site list

**Permission:** `platform.sites.read`

| Name | Type | Required | Default |
|---|---|---|---|
| `from` / `to` | ISO-8601 date-time | no | — (site listing is not a period query) |
| `status` | `active` \| `deactivated` | no | all |
| `ownerId` | UUID | no | all |
| `cursor` | string | no | — |
| `limit` | int 1..100 | no | 20 |

```json
{
  "success": true,
  "data": {
    "sites": [
      {
        "id": "7c1f6b0e-6c4a-4f39-9a1a-2d3e4f5a6b7c",
        "name": "Central Market Lot",
        "code": "central-market",
        "status": "active",
        "currency": "USD",
        "timeZone": "Asia/Phnom_Penh",
        "owner": { "id": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", "displayName": "Sok Chea", "email": "sok.chea@example.com" },
        "activeSessionCount": 14,
        "createdAt": "2026-01-15T08:00:00.000Z"
      }
    ],
    "page": { "nextCursor": null, "hasMore": false }
  },
  "message": null,
  "error": null
}
```

---

## 5. `POST /admin/sites` — create a site for an owner

**Permission:** `platform.sites.create`
**Purpose:** ADMIN-012 — every state change is audited with the actor.

### Request body

```json
{
  "ownerId": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "name": "Riverside Lot",
  "code": "riverside",
  "address": "Street 12, Phnom Penh",
  "timeZone": "Asia/Phnom_Penh",
  "currency": "USD"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `ownerId` | UUID | yes | The owner must exist and not be suspended. |
| `name` | string 2..120 | yes | |
| `code` | slug | yes | `^[a-z0-9]+(-[a-z0-9]+)*$`, unique. |
| `address` | string | no | |
| `timeZone` | IANA zone | yes | Validated against the IANA database. |
| `currency` | ISO-4217 | yes | Upper case. |

### Response — 201

```json
{
  "success": true,
  "data": {
    "id": "3d4e5f6a-7b8c-4d9e-8f01-2a3b4c5d6e7f",
    "name": "Riverside Lot",
    "code": "riverside",
    "status": "active",
    "currency": "USD",
    "timeZone": "Asia/Phnom_Penh",
    "owner": { "id": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", "displayName": "Sok Chea", "email": "sok.chea@example.com" },
    "activeSessionCount": 0,
    "createdAt": "2026-10-21T09:00:00.000Z"
  },
  "message": null,
  "error": null
}
```

### The errors

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | A field is missing or malformed. |
| 403 | `AUTHZ_PERMISSION_DENIED` | The actor does not hold `platform.sites.create`. |
| 404 | `PARK_SITE_NOT_FOUND` | The `ownerId` does not exist. |
| 409 | `CONFLICT` | The `code` is already taken. |

---

## 6. `DELETE /admin/sites/{siteId}` — deactivate a site

**Permission:** `platform.sites.deactivate`

Soft-deletes the site: it blocks new sessions, keeps the history. Nothing is
hard-deleted, ever.

### Request body

```json
{ "reason": "Closed for construction until March" }
```

`reason` is required (1..500 characters) and is recorded in the audit log.

### Response — 200

```json
{ "success": true, "data": { "id": "…", "status": "deactivated" }, "message": null, "error": null }
```

### The errors

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | The reason is missing. |
| 403 | `AUTHZ_PERMISSION_DENIED` | |
| 404 | `PARK_SITE_NOT_FOUND` | |

---

## 7. `GET /admin/owners` — the platform owner list

**Permission:** `platform.owners.read`

| Name | Type | Required | Default |
|---|---|---|---|
| `status` | `active` \| `suspended` | no | all |
| `search` | string 1..120 | no | — (matches the email or the display name) |
| `cursor` | string | no | — |
| `limit` | int 1..100 | no | 20 |

```json
{
  "success": true,
  "data": {
    "owners": [
      {
        "id": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
        "userId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
        "email": "sok.chea@example.com",
        "displayName": "Sok Chea",
        "suspended": false,
        "siteCount": 3,
        "createdAt": "2026-01-10T08:00:00.000Z"
      }
    ],
    "page": { "nextCursor": "eyJpZCI6…", "hasMore": true }
  },
  "message": null,
  "error": null
}
```

---

## 8. `POST /admin/owners` — create an owner

**Permission:** `platform.owners.create`

### Request body

```json
{
  "email": "sok.chea@example.com",
  "displayName": "Sok Chea",
  "temporaryPassword": "…"
}
```

The temporary password is set by the API (never supplied by the client) and
is delivered to the owner out of band. The console shows a one-time
"credentials created" state, never the password itself.

### Response — 201

```json
{
  "success": true,
  "data": {
    "id": "9a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    "userId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "email": "sok.chea@example.com",
    "displayName": "Sok Chea",
    "suspended": false,
    "siteCount": 0,
    "createdAt": "2026-10-21T09:00:00.000Z"
  },
  "message": null,
  "error": null
}
```

### The errors

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | The email is malformed. |
| 403 | `AUTHZ_PERMISSION_DENIED` | |
| 409 | `CONFLICT` | The email is already registered. |

---

## 9. `POST /admin/owners/{ownerId}/suspend` — suspend or reinstate an owner

**Permission:** `platform.owners.suspend`

### Request body

```json
{ "reason": "Failed to pay the platform fee for two months", "suspended": true }
```

`reason` is required. `suspended: false` reinstates the owner.

### Response — 200

```json
{ "success": true, "data": { "id": "…", "suspended": true }, "message": null, "error": null }
```

### The errors

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | The reason is missing. |
| 403 | `AUTHZ_PERMISSION_DENIED` | |
| 404 | `NOT_FOUND` | The owner does not exist. |

---

## 10. `GET /admin/users` — the platform user list

**Permission:** `platform.users.read`

| Name | Type | Required | Default |
|---|---|---|---|
| `role` | `super_admin` \| `owner` \| `guard` \| `user` | no | all |
| `status` | `active` \| `suspended` \| `pending` | no | all |
| `search` | string 1..120 | no | — |
| `cursor` | string | no | — |
| `limit` | int 1..100 | no | 20 |

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
        "email": "sok.chea@example.com",
        "displayName": "Sok Chea",
        "role": "owner",
        "status": "active",
        "scopeKind": "owned",
        "authzVersion": 3,
        "createdAt": "2026-01-10T08:00:00.000Z"
      }
    ],
    "page": { "nextCursor": null, "hasMore": false }
  },
  "message": null,
  "error": null
}
```

**`passwordHash` is never returned.** Not in the list, not in any detail
view. There is no user-detail endpoint in the console's scope.

---

## 11. `POST /admin/users/{userId}/suspend` — suspend or reinstate a user

**Permission:** `platform.users.suspend`

### Request body

```json
{ "reason": "Repeatedly leaving without paying", "suspended": true }
```

Suspending revokes the user's refresh tokens immediately, so the session dies
on the next refresh without waiting for the access token to expire.

### Response — 200

```json
{ "success": true, "data": { "id": "…", "status": "suspended" }, "message": null, "error": null }
```

---

## 12. `GET /admin/audit` — the platform audit viewer

**Permission:** `platform.audit.read`

| Name | Type | Required | Default |
|---|---|---|---|
| `from` / `to` | ISO-8601 date-time | no | the last 7 days |
| `action` | the audit action enum | no | all |
| `outcome` | `SUCCESS` \| `FAILURE` \| `DENIED` | no | all |
| `actorUserId` | UUID | no | — |
| `siteId` | UUID | no | — |
| `targetType` | string | no | — |
| `cursor` | string | no | — |
| `limit` | int 1..100 | no | 50 |

```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
        "action": "site.deactivated",
        "outcome": "SUCCESS",
        "actorUserId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
        "actorRole": "super_admin",
        "siteId": "7c1f6b0e-6c4a-4f39-9a1a-2d3e4f5a6b7c",
        "targetType": "parking_site",
        "targetId": "7c1f6b0e-6c4a-4f39-9a1a-2d3e4f5a6b7c",
        "scope": { "kind": "platform" },
        "ipAddress": "203.0.113.42",
        "userAgent": "…",
        "requestId": "01JB9Z0K8Q4M2N7P3R5T6V8W9X",
        "createdAt": "2026-10-20T14:22:11.000Z"
      }
    ],
    "page": { "nextCursor": "eyJpZCI6…", "hasMore": true }
  },
  "message": null,
  "error": null
}
```

**No ticket token, no claim token and no raw plate appears in an audit row.**
The audit log records the *fact* of an action, never the credential that
performed it.

---

## 13. `POST /admin/audit/export` — export the audit log

**Permission:** `platform.audit.export` — **in addition to** `platform.audit.read`.

The export action is itself audited (`audit.exported`, with the filter, the
row count and the format), is rate-limited, and is bounded in size.

### Request body

```json
{
  "from": "2026-09-01T00:00:00.000Z",
  "to": "2026-10-01T00:00:00.000Z",
  "action": "site.deactivated",
  "format": "csv"
}
```

`format` is `csv` (default) or `json`. The maximum is **100 000 rows**; a
larger request is rejected with `400 VALIDATION_FAILED` and a message that
states the limit.

### Response — 200

```json
{
  "success": true,
  "data": {
    "exportId": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    "rowCount": 1284,
    "format": "csv",
    "downloadUrl": "https://api.chlat-park.com/api/v1/admin/audit/exports/0a1b…",
    "expiresAt": "2026-10-21T11:00:00.000Z"
  },
  "message": null,
  "error": null
}
```

The download URL is short-lived (15 minutes) and single-purpose.

### The errors

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | The range is too long, or the export exceeds 100 000 rows. |
| 403 | `AUTHZ_PERMISSION_DENIED` | The actor holds `platform.audit.read` but not `platform.audit.export`. |
| 429 | `RATE_LIMITED` | The export rate limit was exceeded. |

---

## 14. The per-plate detail view — **deferred, and it is not a console feature**

**Permissions:** `platform.analytics.read` **and** `platform.audit.export`
**Purpose:** ADMIN-011

This view is **not** part of the console's first release, and it is not part
of vireaboth's task list. It is documented here so nobody accidentally
builds a plate list.

If and when it is built, it must:

* return a **masked** plate (`AB***3`), never the raw plate, never the digest;
* be rate-limited to 5 per minute per actor;
* write an `admin.plate_detail_viewed` audit row on **every** use;
* return the aggregates without a plate when the readable plate has been
  redacted by the retention job (90 days by default, ADR-009/ADR-010).

---

## 15. The endpoint index

| # | Method | Path | Permission | Purpose |
|---|---|---|---|---|
| 1 | GET | `/admin/revenue` | `platform.revenue.read` | The revenue panel (§2) |
| 2 | GET | `/admin/adoption` | `platform.analytics.read` | The adoption panel (§3) |
| 3 | GET | `/admin/sites` | `platform.sites.read` | The platform site list (§4) |
| 4 | POST | `/admin/sites` | `platform.sites.create` | Create a site for an owner (§5) |
| 5 | DELETE | `/admin/sites/{siteId}` | `platform.sites.deactivate` | Deactivate a site (§6) |
| 6 | GET | `/admin/owners` | `platform.owners.read` | The platform owner list (§7) |
| 7 | POST | `/admin/owners` | `platform.owners.create` | Create an owner (§8) |
| 8 | POST | `/admin/owners/{ownerId}/suspend` | `platform.owners.suspend` | Suspend / reinstate (§9) |
| 9 | GET | `/admin/users` | `platform.users.read` | The platform user list (§10) |
| 10 | POST | `/admin/users/{userId}/suspend` | `platform.users.suspend` | Suspend / reinstate (§11) |
| 11 | GET | `/admin/audit` | `platform.audit.read` | The audit viewer (§12) |
| 12 | POST | `/admin/audit/export` | `platform.audit.read` + `platform.audit.export` | Export the audit log (§13) |

**Every one of these must be declared in `@chlat/contracts`** with the same
path, method, permission and response shape, so the OpenAPI document and the
typed client are generated from the same source. A route that is not in
`packages/contracts/src/routes/` does not exist.

---

## 16. The change procedure

1. The **shape** changes here (this file) are agreed first.
2. `kitya` implements the endpoint **and** the Zod schema in
   `packages/contracts`, in the same pull request.
3. The schema is exported from `packages/contracts/src/schemas/admin.ts` and
   the route is registered in `packages/contracts/src/routes/`.
4. `pnpm openapi` regenerates `specs/api/openapi.yaml`;
   `pnpm openapi:types` regenerates `@chlat/api-client`'s types.
5. `vireaboth` re-generates the client and updates the console.

A change that skips step 2 breaks the typed client, and the console will
not compile — which is the point.
