# language: en
# Feature: Authorization (RBAC)
# Spec: specs/features/authorization/spec.md
# Requirements covered: RBAC-001 … RBAC-016

  @authz @rbac
  Feature: Permission and scope enforcement

    Background:
      Given a parking site "S1" owned by owner "O1"
      And a parking site "S2" owned by owner "O2"
      And a security guard "G1" assigned to site "S1" with site role "guard"
      And a super admin "SA1" with the full platform grant set
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @RBAC-001 @RBAC-002
    Scenario: An assigned guard may create a session at their site
      Given guard "G1" holds the permission "site.sessions.create"
      When guard "G1" creates a parking session at site "S1"
      Then the response status is 201
      And the session belongs to site "S1"

    @RBAC-006 @RBAC-009
    Scenario: The effective permission set merges role grants and user grants
      Given guard "G1" holds the role grant "site.sessions.create"
      And guard "G1" has a per-user "GRANT" for "site.pricing.manage" with no expiry
      When the effective permission set of guard "G1" is computed
      Then it contains "site.sessions.create"
      And it contains "site.pricing.manage"

    @RBAC-010
    Scenario: Permission resolution is cached briefly
      Given the effective permission set of guard "G1" was resolved within the last 5 seconds
      When the effective permission set of guard "G1" is resolved again
      Then the database was not queried for permissions

    @RBAC-011
    Scenario: Removing a site assignment takes effect on the next request
      Given guard "G1" is assigned to site "S1"
      And guard "G1" holds the permission "site.sessions.read"
      When the assignment of guard "G1" to site "S1" is removed
      And guard "G1" immediately requests the sessions of site "S1"
      Then the response status is 403
      And the error code is "AUTHZ_SCOPE_DENIED"

    # --------------------------------------------------------------- failure

    @RBAC-007
    Scenario: A guard cannot read another site's sessions
      Given guard "G1" is assigned only to site "S1"
      When guard "G1" requests the sessions of site "S2"
      Then the response status is 403
      And the error code is "AUTHZ_SCOPE_DENIED"

    @RBAC-007
    Scenario: An owner cannot read another owner's site
      Given owner "O1" owns site "S1"
      When owner "O1" requests the reports of site "S2"
      Then the response status is 403
      And the error code is "AUTHZ_SCOPE_DENIED"

    @RBAC-009
    Scenario: A per-user revoke overrides the role grant
      Given guard "G1" holds the role grant "site.exit.complete"
      And guard "G1" has a per-user "REVOKE" for "site.exit.complete"
      When the effective permission set of guard "G1" is computed
      Then it does not contain "site.exit.complete"

    @RBAC-014
    Scenario: An expired grant is treated as absent
      Given guard "G1" has a per-user "GRANT" for "site.reports.read" that expired yesterday
      When the effective permission set of guard "G1" is computed
      Then it does not contain "site.reports.read"

    @RBAC-012
    Scenario: A suspended user is rejected immediately
      Given guard "G1" holds a valid session
      When guard "G1" is suspended
      And guard "G1" sends any request with the existing session
      Then the response status is 401

    # ---------------------------------------------------------------- abuse

    @RBAC-008
    Scenario: Super admin scope does not substitute for the permission
      Given the "super_admin" role does not hold the permission "site.reports.read"
      And super admin "SA1" has the platform scope
      When super admin "SA1" requests the reports of site "S1"
      Then the response status is 403
      And the error code is "AUTHZ_PERMISSION_DENIED"

    @RBAC-016
    Scenario: Out-of-scope and non-existent sites are indistinguishable
      Given guard "G1" is assigned to site "S1"
      And site "S9" exists
      When guard "G1" requests a report for site "S8" which does not exist
      And guard "G1" requests a report for site "S9" which does exist
      Then both responses have the same status
      And both response bodies are identical

    @RBAC-013
    Scenario: Denials are audited
      Given guard "G1" is assigned to site "S1"
      When guard "G1" requests the sessions of site "S2"
      Then the audit log contains an "authz.scope_denied" row
      And the row records the actor, the route, the target site, and a request id

    @RBAC-015
    Scenario: An exemption without a reason is rejected
      Given guard "G1" holds the permission "site.payments.exempt" at site "S1"
      When guard "G1" exempts the fee of a session at site "S1" without a reason
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"
      And no exemption was recorded

    @RBAC-003
    Scenario: A route without authorization metadata fails the build
      Given a controller route declares neither "@RequirePermissions" nor "@Public()"
      When the route audit test runs
      Then the test fails
      And the failure message names the route method and path

    @RBAC-004
    Scenario: A public route outside the allowlist fails the build
      Given a controller route is marked "@Public()"
      And that route is not on the reviewed public allowlist
      When the route audit test runs
      Then the test fails

    @RBAC-005
    Scenario: The target site is resolved from the route parameter
      Given a guard is assigned to site "S1"
      When the guard requests the sessions of site "S1"
      Then the scope check was evaluated against site "S1"

    @RBAC-005
    Scenario: The target site is resolved from the loaded session
      Given a session exists at site "S1"
      And a guard is assigned to site "S1"
      When the guard requests to complete the exit of that session
      Then the scope check was evaluated against site "S1"
      And it was not evaluated against a site id from the request body

    @RBAC-005
    Scenario: A site-scoped request with no resolvable target site is denied
      Given a guard is authenticated
      When the guard sends a site-scoped request where no target site can be resolved
      Then the response status is 403
      And the error code is "AUTHZ_PERMISSION_DENIED"
      And the request is denied rather than allowed by default
