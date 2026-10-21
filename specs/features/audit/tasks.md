# Audit Log — Tasks

**Status:** In progress
**Requirement IDs:** AUDIT-001 … AUDIT-014

---

## Phase A — Data

- [ ] **T-A1 — `audit_logs` model and migration.**
  Satisfies: AUDIT-003, AUDIT-014.
  Files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
  Notes: the fields from `design.md` §2; the indexes for the read patterns.

- [ ] **T-A2 — The `AuditAction` enum.**
  Satisfies: AUDIT-001.
  Files: `packages/contracts/src/audit.ts`.
  Notes: the full catalogue from the feature spec; exported for the web app's filter dropdown.

- [ ] **T-A3 — A database role that cannot UPDATE or DELETE `audit_logs`.**
  Satisfies: AUDIT-004.
  Files: `infra/postgres/roles.sql` (or the Coolify init).
  Notes: the application role gets `SELECT` and `INSERT` only on the audit table. This is the
  defence in depth behind the absence of any delete route.

## Phase B — The service

- [ ] **T-B1 — `AuditService.write(tx, entry, actor)`.**
  Satisfies: AUDIT-002, AUDIT-003, AUDIT-013, AUDIT-014.
  Files: `apps/api/src/modules/audit/audit.service.ts`, `.spec.ts`.
  Notes: the transaction client is a required parameter; the actor and the request id come from
  the context.

- [ ] **T-B2 — `AuditService.writeOnMain(entry, actor)`.**
  Satisfies: AUDIT-010.
  Files: `apps/api/src/modules/audit/audit.service.ts`.
  Notes: for the denial path, which has no transaction; rate-limited per actor.

- [ ] **T-B3 — The metadata allow-list.**
  Satisfies: AUDIT-008, AUDIT-009.
  Files: `packages/contracts/src/audit.ts`, `apps/api/src/modules/audit/audit.service.ts`.
  Notes: a per-action metadata schema; forbidden keys (`token`, `password`, `cookie`,
  `authorization`, `plateIdNormalized`) are rejected at write time.

- [ ] **T-B4 — Wire the audit writes into every domain service.**
  Satisfies: AUDIT-001, AUDIT-002.
  Files: the services in `parking-sessions`, `entry-claims`, `tickets`, `payments`,
  `verification`, `parking-sites`, `pricing`, `security-guards`, `owners`, `auth`.
  Notes: the action list in the feature spec §5 is the checklist.

- [ ] **T-B5 — The clock-drift check.**
  Satisfies: AUDIT-003.
  Files: `apps/api/scripts/clock-drift-check.ts`.
  Notes: compare the application clock with the database clock; alert on more than 60 s.

## Phase C — Reading and export

- [ ] **T-C1 — `GET /audit`.**
  Satisfies: AUDIT-005, AUDIT-006.
  Files: `apps/api/src/modules/audit/audit.controller.ts`, `audit.service.ts`.
  Notes: the filters; the scope applied in the query; pagination.

- [ ] **T-C2 — `GET /audit/export`.**
  Satisfies: AUDIT-007.
  Files: `apps/api/src/modules/audit/audit.controller.ts`.
  Notes: `platform.audit.export`; bounded to 100 000 rows; rate-limited to 1/minute per actor;
  streamed as CSV or NDJSON; the export is audited with the filter and the row count.

- [ ] **T-C3 — The owner-scoped audit view.**
  Satisfies: AUDIT-005.
  Files: `apps/api/src/modules/audit/audit.controller.ts`.
  Notes: `site.audit.read`; the site's scope is the `owned` set.

- [ ] **T-C4 — No update or delete routes.**
  Satisfies: AUDIT-004.
  Files: `apps/api/src/modules/audit/audit.controller.ts`.
  Notes: the controller exposes only `GET`. A route audit confirms there is no mutating route.

## Phase D — Retention

- [ ] **T-D1 — The retention job.**
  Satisfies: AUDIT-012.
  Files: `apps/api/scripts/retention.ts`.
  Notes: a 24-month default; delete in bounded batches (e.g. 5 000 rows per transaction) with a
  pause between batches; a dry-run mode; a report of the deleted count.

- [ ] **T-D2 — The retention schedule.**
  Satisfies: AUDIT-012.
  Files: `infra/coolify/cron.md` (or the Coolify cron configuration).
  Notes: a monthly job; the deleted count is reported.

## Phase E — Web

- [ ] **T-E1 — The audit viewer.**
  Satisfies: AUDIT-006.
  Files: `apps/web/src/app/(owner)/owner/audit/page.tsx`,
  `apps/web/src/app/(admin)/admin/audit/page.tsx`.
  Notes: the filters, a paginated table, the action labels in Khmer and English, and no
  edit/delete affordance.

- [ ] **T-E2 — The export button.**
  Satisfies: AUDIT-007.
  Files: `apps/web/src/app/(admin)/admin/audit/page.tsx`.
  Notes: it states the row limit; it shows the row count before the export.

## Phase F — Verification

- [ ] **T-F1 — Transaction atomicity test.**
  Satisfies: AUDIT-002, AUDIT-013.
  Files: `apps/api/test/audit.e2e-spec.ts`.
  Notes: force the audit insert to fail; assert the business change did not happen and no orphan
  row exists.

- [ ] **T-F2 — Redaction test.**
  Satisfies: AUDIT-008, AUDIT-009.
  Files: `apps/api/test/audit.e2e-spec.ts`.
  Notes: run a full claim-and-exit flow; scan every audit row for forbidden keys and values.

- [ ] **T-F3 — Scope test.**
  Satisfies: AUDIT-005.
  Files: `apps/api/test/audit.e2e-spec.ts`.
  Notes: an owner sees only their sites; a guard sees only their assigned sites.

- [ ] **T-F4 — Immutability test.**
  Satisfies: AUDIT-004.
  Files: `apps/api/test/audit.e2e-spec.ts`.
  Notes: assert the controller exposes no mutating route; attempt a direct DELETE and assert 405.
