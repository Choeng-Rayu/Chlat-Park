# language: en
# Feature: Owner management
# Spec: specs/features/owner-management/spec.md
# Requirements covered: OWN-001 … OWN-012

  @owner @management
  Feature: Parking owner operations

    Background:
      Given owner "O1" owns parking site "S1"
      And owner "O2" owns parking site "S2"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @OWN-001 @OWN-003
    Scenario: An owner invites a guard
      Given owner "O1" is authenticated
      When owner "O1" invites "Nok" with email "nok@s1.test" and site role "guard" for site "S1"
      Then the response status is 201
      And a user account exists with role "guard" and status "pending"
      And a security guard profile exists for that user
      And an assignment links the guard to site "S1" with site role "guard"
      And the response contains no password

    @OWN-004
    Scenario: A guard may be a manager at one site and a guard at another
      Given "Nok" is assigned to site "S1" with site role "guard"
      When owner "O2" assigns "Nok" to site "S2" with site role "manager"
      Then both assignments exist
      And the resolved scope of "Nok" contains both "S1" and "S2"

    @OWN-005
    Scenario: Deactivating an assignment takes effect immediately
      Given "Nok" is assigned to site "S1"
      When owner "O1" deactivates the assignment
      And "Nok" immediately requests the sessions of site "S1"
      Then the response status is 403
      And the error code is "AUTHZ_SCOPE_DENIED"

    @OWN-007 @OWN-008
    Scenario: The owner report separates the money figures
      Given site "S1" has 10 completed sessions with collected payments
      And site "S1" has 2 sessions with exemptions
      And site "S1" has 1 voided payment
      And site "S1" has 3 completed sessions with no paid payment
      When owner "O1" requests the report for site "S1" over the last 30 days
      Then the response contains a collected total
      And the response contains an exempt total
      And the response contains a voided total
      And the response contains an uncollected total
      And the four figures are separate values
      And every amount is an integer

    @OWN-009
    Scenario: The owner can read the site audit log
      Given owner "O1" is authenticated
      When owner "O1" reads the audit log for site "S1"
      Then the response status is 200
      And the response contains the entries for site "S1"
      And the response contains no entries for site "S2"

    # --------------------------------------------------------------- failure

    @OWN-002
    Scenario: An owner cannot read another owner's site report
      Given owner "O1" is authenticated
      When owner "O1" requests the report for site "S2"
      Then the response status is 403
      And the error code is "AUTHZ_SCOPE_DENIED"

    @OWN-003
    Scenario: An invitation may not carry a password
      Given owner "O1" is authenticated
      When owner "O1" invites a guard with a body field "password" set to "hunter2"
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"
      And no user was created

    @OWN-006
    Scenario: An effective pricing version cannot be edited
      Given site "S1" has an effective pricing version 3
      When owner "O1" attempts to change the amount of version 3
      Then the request is rejected
      And version 3 is unchanged

    @OWN-010
    Scenario: Suspending an owner blocks access but keeps the data
      Given owner "O1" owns site "S1" with 20 sessions
      When super admin "SA1" suspends owner "O1"
      And owner "O1" makes any request
      Then the response status is 403
      And 20 sessions still exist for site "S1"

    # ---------------------------------------------------------------- abuse

    @OWN-012
    Scenario: An owner cannot grant permissions to a stranger
      Given owner "O1" is authenticated
      When owner "O1" attempts to grant "site.payments.exempt" to a user who is not a guard at their site
      Then the response status is 403
      And no grant was created

    @OWN-012
    Scenario: An owner cannot escalate their own role
      Given owner "O1" is authenticated
      When owner "O1" attempts to change their own role to "super_admin"
      Then the response status is 400 or 403
      And the role of "O1" is still "owner"

    @OWN-011
    Scenario: The owner report contains no plate list
      Given site "S1" has 500 sessions
      When owner "O1" requests the sessions report
      Then the response contains aggregate totals
      And the response contains no "plateId" field
      And the response contains no "plate" field

    @OWN-002
    Scenario: Site enumeration by an owner is contained
      Given owner "O1" owns only site "S1"
      When owner "O1" requests the report for site ids "S2" through "S40"
      Then every response has status 403
      And every error code is "AUTHZ_SCOPE_DENIED"
      And no data from another site appears in any response

    @OWN-009
    Scenario: Audit records are read-only for owners
      Given owner "O1" is authenticated
      When owner "O1" attempts to delete an audit entry
      Then the response status is 405
      And the audit entry still exists
