# language: en
# Feature: Audit log
# Spec: specs/features/audit/spec.md
# Requirements covered: AUDIT-001 … AUDIT-014

  @audit @logging
  Feature: Audit trail

    Background:
      Given a parking site "S1" owned by owner "O1"
      And a parking site "S2" owned by owner "O2"
      And security guard "G1" is assigned to site "S1"
      And super admin "SA1" holds the full platform grant set
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @AUDIT-001 @AUDIT-002 @AUDIT-003
    Scenario: A session creation is audited in the same transaction
      Given guard "G1" is at site "S1"
      When guard "G1" creates a parking session
      Then an audit row exists with the action "session.created"
      And the row records the actor, the site, the session id, the server timestamp, and a request id

    @AUDIT-001
    Scenario: A full flow produces the full action set
      Given a complete entry, claim, and exit flow has run at site "S1"
      When the audit log for site "S1" is queried
      Then rows exist for "session.created"
      And rows exist for "entry_claim.issued"
      And rows exist for "entry_claim.claimed"
      And rows exist for "ticket.issued"
      And rows exist for "exit.verified"
      And rows exist for "payment.recorded"
      And rows exist for "exit.completed"

    @AUDIT-006
    Scenario: The audit log can be filtered
      Given 500 audit rows exist across 3 sites
      When super admin "SA1" filters by site and action with a page size of 20
      Then only the matching rows are returned
      And the response is paginated
      And the total count is reported

    @AUDIT-014
    Scenario: Every row carries the request id
      Given guard "G1" creates a parking session
      When the audit row for that session is inspected
      Then the row has a request id
      And the request id matches the "X-Request-Id" header of the response

    # --------------------------------------------------------------- failure

    @AUDIT-002 @AUDIT-013
    Scenario: A failed audit write rolls back the business change
      Given the audit insert will fail
      When guard "G1" creates a parking session
      Then the response status is 500
      And no session exists
      And no orphan audit row exists

    @AUDIT-005
    Scenario: An owner sees only their own sites in the audit log
      Given owner "O1" is authenticated
      When owner "O1" reads the audit log
      Then no row for site "S2" appears in the response
      And the total count reflects only site "S1"

    @AUDIT-011
    Scenario: An override without a reason is rejected
      Given a "PAID" payment
      When a guard attempts to void it without a reason
      Then the request is rejected
      And no audit row claims a void occurred

    @AUDIT-004
    Scenario: Audit rows cannot be modified or deleted
      Given an audit row exists
      When a delete is attempted against it
      Then the response status is 405
      And the audit row still exists

    # ---------------------------------------------------------------- abuse

    @AUDIT-008
    Scenario: No token or credential reaches the audit log
      Given a complete claim and exit flow has run
      When every audit row is inspected
      Then no row contains a raw claim token
      And no row contains a raw ticket token
      And no row contains a password
      And no row contains the bot token
      And no row contains the plate pepper

    @AUDIT-010
    Scenario: A denied request is audited
      Given guard "G1" is assigned to site "S1"
      When guard "G1" requests the sessions of site "S2"
      Then an audit row exists with the action "authz.scope_denied"
      And the row records the actor, the route, the required permission, the target site, and the request id

    @AUDIT-007
    Scenario: An over-large export is rejected and audited
      Given 200000 audit rows exist
      When super admin "SA1" requests an export of the full period
      Then the response status is 400
      And the response states the maximum export size
      And an audit row exists for the export attempt

    @AUDIT-007
    Scenario: A successful export is audited with its filter
      Given 100 audit rows exist
      When super admin "SA1" exports the audit log for site "S1"
      Then an audit row exists with the action "admin.audit_exported"
      And the row records the site filter and the row count

    @AUDIT-009
    Scenario: The readable plate is not in the ordinary audit rows
      Given guard "G1" created a session for plate "AB-123"
      When the audit log is inspected
      Then no ordinary row contains the readable plate "AB-123"
      And the "session.created" row contains the plate digest

    @AUDIT-012
    Scenario: The retention job deletes only the expired rows
      Given audit rows exist both inside and outside the 24 month retention window
      When the audit retention job runs
      Then only the rows older than the retention window are deleted
      And every newer row still exists

    @AUDIT-012
    Scenario: The retention job deletes in bounded batches
      Given 200000 audit rows exist that are all older than the retention window
      When the audit retention job runs
      Then the rows are deleted in batches of at most 5000 rows per transaction
      And the job completes without a single long-running transaction

    @AUDIT-012
    Scenario: The retention job is idempotent
      Given audit rows exist that are all older than the retention window
      When the audit retention job runs twice
      Then the second run deletes 0 rows
      And no error is raised
