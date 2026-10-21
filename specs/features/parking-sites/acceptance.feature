# language: en
# Feature: Parking sites
# Spec: specs/features/parking-sites/spec.md
# Requirements covered: PARK-001 … PARK-010

  @park @sites
  Feature: Parking site management and selection

    Background:
      Given owner "O1" owns parking site "S1" with currency "USD" and timezone "Asia/Phnom_Penh"
      And owner "O2" owns parking site "S2"
      And security guard "G1" is assigned to site "S1"
      And site "S1" has the default settings
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @PARK-001 @PARK-002
    Scenario: An assigned guard creates a session at their site
      Given guard "G1" selects site "S1"
      When guard "G1" creates a parking session at site "S1" with plate "AB-123"
      Then the response status is 201
      And the session's site is "S1"

    @PARK-003
    Scenario: The owner of a new site is derived from the actor
      Given owner "O1" is authenticated
      When owner "O1" creates a site named "Riverside" with body field "ownerId" equal to owner "O2"'s id
      Then the created site's owner is "O1"
      And the response body does not echo the supplied "ownerId"

    @PARK-004
    Scenario: A valid site configuration is accepted
      Given owner "O1" is authenticated
      When owner "O1" creates a site with name "Riverside" and timezone "Asia/Phnom_Penh" and currency "USD"
      Then the response status is 201
      And the site timezone is "Asia/Phnom_Penh"
      And the site currency is "USD"

    @PARK-005
    Scenario: A session at a site uses that site's currency
      Given site "S1" has currency "USD"
      When a payment of 2.50 is recorded for a session at site "S1"
      Then the payment amount in minor units is 250
      And the payment currency is "USD"

    @PARK-007
    Scenario: The default entry claim TTL is 5 minutes
      Given site "S1" has the default settings
      When site "S1" is read
      Then the entry claim TTL is 300 seconds

    @PARK-006
    Scenario: The accepted payment methods are stored on the site
      Given owner "O1" is authenticated
      When owner "O1" sets the accepted payment methods of site "S1" to "CASH" and "KHQR_MANUAL"
      Then the site's accepted payment methods are "CASH" and "KHQR_MANUAL"

    @PARK-009
    Scenario: Listing sites returns only the actor's own sites
      Given owner "O1" owns 3 sites
      And owner "O2" owns 2 sites
      When owner "O1" lists sites with a page size of 50
      Then the response contains only the 3 sites owned by "O1"
      And the response contains a "total" field equal to 3

    # --------------------------------------------------------------- failure

    @PARK-002
    Scenario: A guard cannot create a session at a site they are not assigned to
      Given guard "G1" is assigned only to site "S1"
      When guard "G1" creates a parking session at site "S2"
      Then the response status is 403
      And the error code is "AUTHZ_SCOPE_DENIED"
      And no session was created

    @PARK-001
    Scenario: A site-scoped request without a resolvable site is rejected
      Given guard "G1" is authenticated
      When guard "G1" sends a request to a site-scoped endpoint with no site id
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"

    @PARK-004
    Scenario: An invalid timezone is rejected
      Given owner "O1" is authenticated
      When owner "O1" creates a site with timezone "Mars/Olympus"
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"
      And the details name the field "timezone"

    @PARK-010
    Scenario: A deactivated site rejects new sessions
      Given site "S1" has been deactivated
      When guard "G1" creates a parking session at site "S1"
      Then the response status is 409
      And the error code is "PARK_SITE_DEACTIVATED"

    @PARK-005
    Scenario: The currency cannot change once a session exists
      Given site "S1" has one parking session
      When owner "O1" changes the currency of site "S1" to "KHR"
      Then the response status is 409
      And the error code is "PARK_SITE_CURRENCY_IMMUTABLE"

    @PARK-008
    Scenario: The same plate cannot have two active sessions at one site
      Given site "S1" has the policy "one active session per plate"
      And an "ACTIVE" session exists at site "S1" for normalized plate "AB123"
      When guard "G1" creates a session at site "S1" for plate "ab-123"
      Then the response status is 409
      And the error code is "PARK_DUPLICATE_ACTIVE_SESSION"
      And the response details contain the id of the existing session

    # ---------------------------------------------------------------- abuse

    @PARK-002
    Scenario: Enumerating site ids does not leak other sites
      Given guard "G1" is assigned to site "S1"
      When guard "G1" attempts to create sessions at site ids "S2" through "S50"
      Then every response has status 403
      And every error code is "AUTHZ_SCOPE_DENIED"
      And no session was created at any site

    @PARK-003
    Scenario: An owner cannot modify another owner's site
      Given owner "O1" is authenticated
      When owner "O1" attempts to update site "S2"
      Then the response status is 403
      And the error code is "AUTHZ_SCOPE_DENIED"
      And site "S2" is unchanged

    @PARK-010
    Scenario: Deactivating a site preserves its history
      Given site "S1" has 100 completed sessions
      When super admin "SA1" deactivates site "S1"
      Then the response status is 200
      And 100 sessions still exist for site "S1"
      And the audit log contains a "site.deactivated" row

    @PARK-008
    Scenario: The same plate may park at two different sites
      Given site "S1" has the policy "one active session per plate"
      And an "ACTIVE" session exists at site "S1" for normalized plate "AB123"
      When a guard at site "S2" creates a session for plate "AB-123"
      Then the response status is 201
