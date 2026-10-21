# Chlat-Park — Data Schema

**Status:** Accepted
**Last updated:** 2026-10-21
**Data layer:** Prisma 7 · PostgreSQL 16
**Related:** [`migrations.md`](./migrations.md) · [`../architecture/rbac-design.md`](../architecture/rbac-design.md) · [`../decisions/ADR-001-monorepo.md`](../decisions/ADR-001-monorepo.md)

---

## 1. The model of record

The Prisma schema at `apps/api/prisma/schema.prisma` is the executable source of truth. This
document is the **narrative** of that schema: the relationships, the invariants, and the reasoning
behind the amendments to the plan's §10.

## 2. The entity relationship narrative

```
Platform
────────
User ──1:0..1── ParkingOwner ──1:N── ParkingSite ──1:N── PricingPolicy
 │                                            │
 │                                            ├──1:N── GuardSiteAssignment ──N:1── SecurityGuard
 │                                            │            │
 │                                            │            └── (guardId → SecurityGuard.userId → User)
 │                                            │
 │                                            ├──1:N── ParkingSession
 │                                            │            ├──1:1── Ticket
 │                                            │            ├──1:N── EntryClaim
 │                                            │            ├──1:N── Payment
 │                                            │            ├──1:N── ReviewCase
 │                                            │            └──N:1── PricingPolicy  (the version in effect)
 │                                            │
 │                                            ├──1:N── Payment        (denormalised site_id)
 │                                            └──1:N── AuditLog       (site_id)
 │
 ├──1:0..1── TelegramIdentity  (linkedAt nullable — a guest may message the bot first)
 ├──1:N── UserPermissionGrant
 └──N:M── Permission  (through RolePermission, by role)
```

### 2.1 The two identity chains

| Chain | Path | Meaning |
|---|---|---|
| Owner | `User → ParkingOwner → ParkingSite` | The tenant boundary. Every site has exactly one owner. |
| Guard | `User → SecurityGuard → GuardSiteAssignment → ParkingSite` | The assignment boundary. A guard may work at many sites, with a different role at each. |

The **owner** chain is a hard 1:N: a site belongs to exactly one owner, and changing that is a
platform-level operation, not a routine edit. The **guard** chain is a many-to-many with a role on
the edge.

## 3. The models

### 3.1 `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | The primary key |
| `email` | `text?` | Unique and nullable — a guest-linked user may not have one |
| `phone` | `text?` | Unique and nullable |
| `passwordHash` | `text?` | Nullable — a Telegram-only user may not have one |
| `displayName` | `text?` | |
| `role` | `UserRole` | `super_admin \| owner \| guard \| user` — the **coarse** layer |
| `status` | `UserStatus` | `active \| suspended \| pending` |
| `scopeKind` | `ScopeKind` | `platform \| owned \| assigned \| self` — the **primary** scope |
| `authzVersion` | `int` | Bumped on any permission/assignment change |
| `lastLoginAt` | `timestamptz?` | |
| `passwordChangedAt` | `timestamptz?` | |
| `createdAt` / `updatedAt` | `timestamptz(3)` | |

**Why `scopeKind` is a column when the scope is a union.** `scopeKind` records the actor's
*primary* scope for display and coarse routing. The authoritative scope is always recomputed from
the data (the owner's sites, the guard's assignments) and may be a union. See
`../architecture/rbac-design.md` §4.2.

### 3.2 `permissions`, `role_permissions`, `user_permission_grants`

See `../architecture/rbac-design.md` §8 for the full definition. The catalogue is seeded from
`packages/contracts/src/permissions.ts`; the seed script is idempotent.

### 3.3 `parking_owners`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `userId` | `uuid` | Unique — one profile per user |
| `name` | `text` | The business name |
| `status` | `OwnerStatus` | `active \| suspended` |
| `createdAt` / `updatedAt` | `timestamptz(3)` | |

### 3.4 `parking_sites`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `ownerId` | `uuid` | Required. Indexed. |
| `name` | `text` | ≤ 120 characters |
| `address` | `text?` | ≤ 500 characters |
| `timezone` | `text` | An IANA identifier. Default `Asia/Phnom_Penh` |
| `currency` | `text` | An ISO-4217 code. Default `USD` |
| `status` | `SiteStatus` | `active \| deactivated` |
| `settingsJson` | `jsonb` | The validated settings object (see below) |
| `createdAt` / `updatedAt` | `timestamptz(3)` | |

**`settingsJson`**

```jsonc
{
  "entryClaimTtlSeconds": 300,          // 60..3600, default 300
  "acceptedPaymentMethods": ["CASH"],   // the methods offered at the exit
  "maxActiveSessionsPerPlate": 1,       // 1 = one active session per plate; 2 = allow multiple
  "gracePeriodMinutes": 0,
  "defaultLanguage": "km"               // the site's display language
}
```

The settings are validated by `ParkingSiteSettings` in `@chlat/contracts` on write, and unknown
keys are rejected. The fields that are *queried* (`owner_id`, `status`) are real columns with
indexes; everything else lives in the JSON.

### 3.5 `security_guards` and `guard_site_assignments`

| `security_guards` | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `userId` | `uuid` | Unique |
| `status` | `GuardStatus` | `active \| deactivated` |
| `createdAt` | `timestamptz(3)` | |

| `guard_site_assignments` | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `guardId` | `uuid` | Indexed |
| `siteId` | `uuid` | Indexed |
| `role` | `SiteRole` | `guard \| manager` — the site-level hierarchy |
| `status` | `AssignmentStatus` | `active \| deactivated` |
| `createdAt` / `updatedAt` | `timestamptz(3)` | |

`@@unique([guardId, siteId])` — a guard has at most one assignment per site.

> **Naming note (L1).** The model is `SecurityGuard`, not `guards`. `src/common/guards/` in the
> NestJS app holds the framework guards (`PermissionGuard`, `JwtAuthGuard`, …). The two must never
> collide.

### 3.6 `pricing_policies`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `siteId` | `uuid` | Indexed |
| `version` | `int` | `@@unique([siteId, version])` — monotonic per site |
| `ruleType` | `PricingRuleType` | `FLAT \| HOURLY \| TIERED` |
| `configurationJson` | `jsonb` | The rule configuration, validated per `ruleType` |
| `effectiveFrom` | `timestamptz(3)` | A future date schedules the policy |
| `isActive` | `boolean` | Whether the policy is still in the set |
| `createdById` | `uuid?` | |
| `createdAt` | `timestamptz(3)` | |

**Policies are immutable.** There is no update path. A change creates a new version.

### 3.7 `parking_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | The primary key |
| `siteId` | `uuid` | Indexed with `status` and with `createdAt` |
| `plateIdOriginal` | `text` | Exactly as the guard typed it |
| `plateIdNormalized` | `text` | The ADR-007 canonical form |
| `plateDigest` | `text?` | `HMAC-SHA256(pepper, normalized)` — indexed |
| `guestUserId` | `uuid?` | Set when the ticket is linked to an account |
| `status` | `SessionStatus` | The six-state machine |
| `entryAt` | `timestamptz?` | Null while `PENDING_CLAIM`; the fee clock start |
| `exitAt` | `timestamptz?` | |
| `pricingPolicyId` | `uuid?` | The version in effect at creation |
| `pricingPolicyVersion` | `int?` | Denormalised for reporting |
| `feeAmountMinor` | `int?` | The **snapshot**, written at exit completion |
| `feeCurrency` | `text?` | The snapshot's currency |
| `createdByGuardId` | `uuid?` | |
| `completedByGuardId` | `uuid?` | |
| `rowVersion` | `int` | The optimistic-locking counter |
| `createdAt` / `updatedAt` | `timestamptz(3)` | |

### 3.8 `entry_claims`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `sessionId` | `uuid` | Indexed |
| `claimTokenHash` | `text` | **Unique.** `SHA-256(rawToken)` — the raw token is never stored |
| `expiresAt` | `timestamptz(3)` | Indexed — the server clock + the site's TTL |
| `claimedAt` | `timestamptz?` | Set once |
| `revokedAt` | `timestamptz?` | |
| `revokedReason` | `text?` | `reissued \| session_cancelled` |
| `issuedToGuardId` | `uuid?` | |
| `issuedAt` / `createdAt` | `timestamptz(3)` | |

### 3.9 `tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `sessionId` | `uuid` | **Unique** — one ticket per session |
| `publicReference` | `text` | **Unique.** The human-typable code |
| `tokenHash` | `text?` | **Unique.** `SHA-256(rawToken)` |
| `plateDigest` | `text?` | For the per-plate view |
| `status` | `TicketStatus` | `ISSUED \| REVOKED \| EXPIRED` |
| `issuedAt` | `timestamptz(3)` | |
| `revokedAt` / `revokedReason` | | |
| `guestUserId` | `uuid?` | The linked account |
| `linkedAt` | `timestamptz?` | |
| `createdAt` / `updatedAt` | `timestamptz(3)` | |

### 3.10 `payments`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `sessionId` | `uuid` | Indexed with `status` |
| `siteId` | `uuid` | **Denormalised** for reporting; indexed with `capturedAt` |
| `amountMinor` | `int` | Integer minor units — never a float |
| `currency` | `text` | |
| `method` | `PaymentMethod` | `CASH \| KHQR_MANUAL \| OTHER_MANUAL` |
| `status` | `PaymentStatus` | `UNPAID \| PENDING \| PAID \| FAILED \| EXEMPT \| VOIDED` |
| `providerReference` | `text?` | Unused in the MVP (no provider) |
| `confirmedByGuardId` | `uuid?` | |
| `confirmedAt` | `timestamptz?` | |
| `capturedAt` | `timestamptz?` | Set on a confirmed payment — the revenue window key |
| `exemptionReason` | `text?` | |
| `voidedReason` / `voidedById` | | The explicit correction |
| `reason` | `text?` | Why the payment was recorded |
| `createdAt` / `updatedAt` | `timestamptz(3)` | |

**The partial unique index** (created in a raw SQL migration step):

```sql
CREATE UNIQUE INDEX payments_one_paid_per_session
  ON payments (session_id)
  WHERE status = 'PAID';
```

### 3.11 `audit_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `siteId` | `uuid?` | Indexed with `createdAt` |
| `actorUserId` | `uuid?` | Indexed with `createdAt` |
| `action` | `text` | The `AuditAction` value |
| `entityType` | `text` | |
| `entityId` | `text?` | |
| `reason` | `text?` | Mandatory for the override actions |
| `metadataJson` | `jsonb` | An allow-listed, small object |
| `requestId` | `text?` | The correlation id |
| `createdAt` | `timestamptz(3)` | Indexed |

### 3.12 `telegram_identities`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `userId` | `uuid?` | **Nullable** — a user may message the bot before registering |
| `telegramUserId` | `text` | **Unique** |
| `chatId` | `text?` | |
| `languageCode` | `text` | The locale resolution for the bot |
| `linkedAt` | `timestamptz?` | |
| `createdAt` / `updatedAt` | `timestamptz(3)` | |

### 3.13 `refresh_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `userId` | `uuid` | Indexed |
| `tokenHash` | `text` | **Unique** — the raw token is not stored |
| `familyId` | `uuid` | Indexed — the rotation family; a reuse revokes the family |
| `issuedAt` / `expiresAt` | `timestamptz(3)` | |
| `revokedAt` / `revokedReason` | | |
| `userAgent` / `ip` | `text?` | For the login audit |

### 3.14 `sync_events` (deferred)

Defined in `specs/features/offline-sync/design.md` §2. The table may be created in the MVP as an
empty migration so the offline phase does not need a schema change, or it may be created in Phase
6. **The current recommendation: create it in Phase 6** — an unused table invites the assumption
that offline is available.

### 3.15 `review_cases`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `sessionId` | `uuid` | Indexed |
| `siteId` | `uuid` | Indexed with `status` |
| `reason` | `text` | Mandatory |
| `category` | `ReviewCategory` | `PLATE_MISMATCH \| TICKET_DISPUTE \| PAYMENT_DISPUTE \| LOST_TICKET \| OTHER` |
| `status` | `ReviewStatus` | `OPEN \| RESOLVED` |
| `openedById` | `uuid` | |
| `openedAt` | `timestamptz(3)` | |
| `resolvedById` / `resolvedAt` | | |
| `resolution` | `text?` | The reason for the resolution |
| `resolvedTo` | `SessionStatus?` | The target state |

## 4. The invariants

These are enforced by the database where possible and by the service layer everywhere else.

| # | Invariant | Enforced by |
|---|---|---|
| INV-01 | A session belongs to exactly one site. | A non-null `site_sessions.site_id` FK |
| INV-02 | A session can only complete once. | The state machine (`COMPLETED` has no outgoing edge) + the row lock + `row_version` |
| INV-03 | A completed session cannot be reopened through an ordinary API. | The state machine + the absence of any reopen route |
| INV-04 | A ticket exists at most once per session. | `tickets.session_id` UNIQUE |
| INV-05 | A claim token is used at most once. | `entry_claims.claimed_at` is set in the claim transaction; the ticket UNIQUE constraint is the backstop |
| INV-06 | The ticket and the session state are both checked during the exit authorization. | The verification service + the completion re-check |
| INV-07 | Duplicate event ids never apply the same effect twice. | `sync_events.event_id` UNIQUE (deferred) |
| INV-08 | Money is an integer number of minor units with a defined currency. | `amountMinor Int` + `currency` NOT NULL |
| INV-09 | Every manual override has an authorized actor and an audit reason. | The DTO requires a non-empty reason; the permission is checked; the audit row is in the transaction |
| INV-10 | `payments.site_id` equals the session's `site_id`. | Copied in code inside the transaction + the nightly consistency check |
| INV-11 | The same plate may park at different sites, or return later. | **No global unique constraint on the plate.** The active-session policy is enforced at the site level (`maxActiveSessionsPerPlate`) |
| INV-12 | A pricing policy is never modified. | No update path; a new version instead |
| INV-13 | A voided payment is never deleted. | The status is set to `VOIDED`; there is no delete route |
| INV-14 | An audit row is never updated or deleted. | No update/delete route + the database role has only `SELECT` and `INSERT` |
| INV-15 | `entry_at` is null while the session is `PENDING_CLAIM`. | The service sets both together; a constraint test asserts it |
| INV-16 | The fee snapshot matches the fee that was displayed. | Both come from the same `calculate` call; the preview is tested against the snapshot |
| INV-17 | The raw claim and ticket tokens are never stored. | The columns are `*_hash`; the raw value exists only in the issuance response |

## 5. The amendments versus the plan's §10 schema

| # | Amendment | Reason |
|---|---|---|
| A-01 | `guards` → **`security_guards`** | Avoid a collision with `src/common/guards/` (L1) |
| A-02 | `guard_site_assignments` += `role` (`guard \| manager`) | The site-level hierarchy for guards |
| A-03 | `guard_site_assignments` += `status` | A deactivation must be distinguishable from a deletion |
| A-04 | `users` += `role`, `status`, `scopeKind`, `authzVersion` | The coarse layer and the scope model |
| A-05 | New: `permissions`, `role_permissions`, `user_permission_grants` | The fine-grained layer (ADR-006) |
| A-06 | New: `refresh_tokens` | The rotating refresh token with reuse detection |
| A-07 | New: `review_cases` | The manual review workflow |
| A-08 | New: `telegram_updates` | The webhook dedupe (P1) |
| A-09 | `parking_sessions` += `plate_digest` (HMAC, indexed) | The lifetime distinct-guest counting (ADR-010) |
| A-10 | `parking_sessions` += `fee_amount_minor`, `fee_currency` | The fee snapshot; stable historical revenue |
| A-11 | `parking_sessions` += `pricing_policy_version` | Denormalised for reporting |
| A-12 | `parking_sessions` += `row_version` | The optimistic-locking counter |
| A-13 | `parking_sessions` += `guest_user_id` | The guest→account link |
| A-14 | `tickets` += `plate_digest` | The per-plate admin view |
| A-15 | `tickets` += `guest_user_id`, `linked_at` | The guest→account link |
| A-16 | `payments` += `site_id` (denormalised, indexed) | The reporting queries |
| A-17 | `payments` += `captured_at` | The revenue window key; separates "recorded" from "captured" |
| A-18 | `payments` += `voided_reason`, `voided_by_id` | The explicit correction (ADR-005) |
| A-19 | `PaymentStatus` += `VOIDED` | Corrections are explicit, never silent edits (ADR-005) |
| A-20 | `audit_logs` += `request_id` | The correlation id |
| A-21 | `entry_claims` += `revoked_reason`, `issued_to_guard_id` | The revocation audit |
| A-22 | `telegram_identities.user_id` is **nullable** | A user may message the bot before registering |
| A-23 | `parking_sites` += `currency`, `status` | The per-site currency and the deactivation state |
| A-24 | `parking_sites.settings_json` → `settings_json` (validated) | The per-site configuration |
| A-25 | New: the partial unique index on `payments(session_id) WHERE status='PAID'` | One settled payment per session |

## 6. The indexing strategy

| Index | Table | Serves |
|---|---|---|
| `(site_id, status)` | `parking_sessions` | The guard dashboard's active list |
| `(site_id, created_at)` | `parking_sessions` | The site session list; the date-range reports |
| `(plate_digest)` | `parking_sessions` | The adoption query: `count(distinct plate_digest)` |
| `(plate_id_normalized, site_id)` | `parking_sessions` | The duplicate-active-session check |
| `claim_token_hash` UNIQUE | `entry_claims` | The claim lookup (constant-time via the index) |
| `(expires_at)` | `entry_claims` | The expiry sweeper |
| `session_id` UNIQUE | `tickets` | One ticket per session |
| `public_reference` UNIQUE | `tickets` | The manual-entry lookup |
| `token_hash` UNIQUE | `tickets` | The token lookup |
| `(session_id, status)` | `payments` | The payment requirement check |
| `(site_id, captured_at)` | `payments` | The revenue query |
| `payments_one_paid_per_session` (partial) | `payments` | One settled payment per session |
| `(site_id, created_at)` | `audit_logs` | The site audit view |
| `(actor_user_id, created_at)` | `audit_logs` | The actor audit view |
| `(action, created_at)` | `audit_logs` | The action filter |
| `(created_at)` | `audit_logs` | The export and the retention job |
| `(owner_id)`, `(status)` | `parking_sites` | The site list and the scope resolution |
| `(site_id, version)` UNIQUE | `pricing_policies` | The effective-policy lookup |
| `[role, permission_key]` UNIQUE | `role_permissions` | The role grant lookup |
| `[user_id, permission_key]` UNIQUE | `user_permission_grants` | The per-user override lookup |
| `(telegram_user_id)` UNIQUE | `telegram_identities` | The Telegram identity lookup |

## 7. Money, currency, and rounding (ADR-012)

* Every amount is an **integer number of minor units**.
* The currency is stored explicitly on every row that holds an amount, and it comes from the site.
* Rounding is applied **once**, at the end of the fee calculation, **half-up**.
* The fee is never negative; the minimum is 0.
* The MVP currencies are **USD** (2 minor digits) and **KHR** (0 minor digits). A site has exactly
  one currency, and it is immutable once the site has a session.

## 8. Retention

| Data | Retention | Mechanism |
|---|---|---|
| `audit_logs` | 24 months | The monthly retention job, in bounded batches |
| `parking_sessions` | 24 months (indefinite for the financial record) | The retention job, aligned with the audit policy |
| `parking_sessions.plate_id_normalized` | 90 days after the exit, then redacted | The redaction job sets it to `NULL`; `plate_digest` is retained for the lifetime count |
| `payments` | Indefinite (the financial record) | Never deleted; `VOIDED` marks a correction |
| `tickets`, `entry_claims` | 90 days after the session closes | The retention job |
| `refresh_tokens` | 30 days after expiry | The retention job |
| `plate_digest` | Retained for the lifetime count | Pepper rotation breaks the continuity (ADR-010) |

The redaction of `plate_id_normalized` **does not** remove the row, the ticket, the payment, or the
audit trail — only the readable plate.

## 9. Related

* `specs/data/migrations.md` — the migration policy and the rollback procedure.
* `specs/architecture/rbac-design.md` — the RBAC models and the revenue queries.
* `specs/features/audit/` — the audit log.
* `specs/features/admin-console/` — the reporting queries.
* ADR-009 (retention) · ADR-010 (guest identity and privacy) · ADR-012 (currency and rounding).
