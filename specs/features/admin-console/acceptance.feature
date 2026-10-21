# language: en
# Feature: Admin console
# Spec: specs/features/admin-console/spec.md
# Requirements covered: ADMIN-001 … ADMIN-014

  @admin @platform
  Feature: Platform revenue and adoption console

    Background:
      Given a parking site "S1" owned by owner "O1" with currency "USD"
      And a parking site "S2" owned by owner "O2" with currency "USD"
      And super admin "SA1" holds the full platform grant set
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @ADMIN-001 @ADMIN-002
    Scenario: Revenue separates collected, exempt and voided
      Given a "PAID" payment of 10.00 exists at site "S1" in the period
      And an "EXEMPT" payment of 2.00 exists at site "S1" in the period
      And a "VOIDED" payment of 1.00 exists at site "S1" in the period
      When super admin "SA1" requests the revenue report for the period
      Then the collected total is 1000 minor units
      And the exempt total is 200 minor units
      And the voided total is 100 minor units
      And the collected total does not include the exempt or voided amounts

    @ADMIN-003
    Scenario: Uncollected at close is reported
      Given 3 completed sessions at site "S1" have a fee snapshot of 1.00 each
      And none of them has a "PAID" payment
      When super admin "SA1" requests the revenue report for the period
      Then the uncollected session count is 3
      And the uncollected total is 300 minor units

    @ADMIN-005
    Scenario: Registered users and guests are counted separately
      Given 50 users have the role "user"
      And 300 distinct guest plates have parked
      When super admin "SA1" requests the adoption report
      Then the registered user count is 50
      And the distinct guest count is 300

    @ADMIN-006
    Scenario: The funnel reports the claim rate
      Given 100 sessions were created in the period
      And 90 tickets were issued in the period
      And 80 sessions were completed in the period
      When super admin "SA1" requests the adoption report
      Then the sessions created count is 100
      And the tickets issued count is 90
      And the sessions completed count is 80
      And the claim rate is 0.9
      And the completion rate is 0.8

    @ADMIN-007
    Scenario: The repeat rate counts plates with more than one visit
      Given 100 distinct plates parked in the period
      And 25 of them parked at least twice
      When super admin "SA1" requests the adoption report
      Then the repeat rate is 0.25

    @ADMIN-008
    Scenario: The report breaks down by site
      Given 10 sessions exist at site "S1" and 5 at site "S2"
      When super admin "SA1" requests the adoption report
      Then the per-site breakdown contains an entry for "S1" with 10 sessions
      And the per-site breakdown contains an entry for "S2" with 5 sessions

    @ADMIN-009
    Scenario: The trend has one row per month
      Given sessions exist in 3 different months
      When super admin "SA1" requests the adoption report
      Then the trend contains 3 rows
      And each row contains a new distinct plate count and a session count

    @ADMIN-012
    Scenario: Platform state changes are audited
      Given super admin "SA1" is authenticated
      When super admin "SA1" suspends owner "O2" with the reason "non payment"
      Then the audit log contains a "platform.owner_suspended" row
      And the row names the actor and the owner

    # --------------------------------------------------------------- failure

    @ADMIN-014
    Scenario: An over-long range is rejected
      Given super admin "SA1" is authenticated
      When super admin "SA1" requests a report covering 500 days
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"

    @ADMIN-011
    Scenario: The per-plate view requires the export permission
      Given super admin "SA1" does not hold the permission "platform.audit.export"
      When super admin "SA1" requests the per-plate detail view
      Then the response status is 403
      And the error code is "AUTHZ_PERMISSION_DENIED"

    @ADMIN-002
    Scenario: A period with only exemptions reports zero collected
      Given only "EXEMPT" payments of 5.00 exist in the period
      When super admin "SA1" requests the revenue report
      Then the collected total is 0
      And the exempt total is 500 minor units

    @ADMIN-010
    Scenario: No response contains a plate digest
      Given 100 sessions with plate digests exist
      When super admin "SA1" requests the adoption report
      Then the response contains no "plateDigest" field
      And no value in the response equals a plate digest

    # ---------------------------------------------------------------- abuse

    @ADMIN-010
    Scenario: A large dataset does not produce a per-plate list
      Given 10000 sessions exist across 2 sites
      When super admin "SA1" requests the adoption report
      Then the response contains at most 2 per-site rows
      And the response contains no per-plate rows
      And the response size is bounded

    @ADMIN-011
    Scenario: The per-plate view is rate limited and audited
      Given super admin "SA1" holds both "platform.analytics.read" and "platform.audit.export"
      When super admin "SA1" uses the per-plate view 5 times within a minute
      And super admin "SA1" uses it a 6th time
      Then the 6th request has status 429
      And 6 "admin.plate_detail_viewed" audit rows exist
      And no response contains a raw plate

    @ADMIN-013
    Scenario: An over-large export is rejected and audited
      Given 200000 audit rows exist
      When super admin "SA1" requests an export of the full period
      Then the response status is 400
      And the response states the maximum export size
      And the audit log contains an "admin.audit_export_requested" row

    @ADMIN-001
    Scenario: Uncaptured payments are surfaced
      Given a payment was recorded in the period but never captured
      When super admin "SA1" requests the revenue report
      Then the response contains an uncaptured payment count of 1
      And the collected total does not include that payment

    @ADMIN-004
    Scenario: Distinct guests are counted through the plate digest
      Given 300 distinct motorcycle plates have parked at least once
      And one of those plates has parked 50 times
      When super admin "SA1" requests the adoption report
      Then the distinct guest count is 300
      And the session count for that repeated plate is 50

    @ADMIN-004
    Scenario: The plate digest is never returned to a client
      Given sessions exist with plate digests
      When super admin "SA1" requests the adoption report
      Then no response contains a "plateDigest" field
      And no response value equals a stored plate digest
