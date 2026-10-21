# language: en
# Feature: Parking session
# Spec: specs/features/parking-session/spec.md
# Requirements covered: SESSION-001 … SESSION-014

  @park @sessions
  Feature: Parking session lifecycle

    Background:
      Given a parking site "S1" owned by owner "O1" with currency "USD"
      And security guard "G1" is assigned to site "S1"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @SESSION-001 @SESSION-004
    Scenario: A guard creates a pending session
      Given guard "G1" is at site "S1"
      When guard "G1" creates a session with plate " ab-123 "
      Then the response status is 201
      And the session status is "PENDING_CLAIM"
      And the session plate original is " ab-123 "
      And the session plate normalized is "AB123"
      And the session entry time is null

    @SESSION-002
    Scenario: Session creation is transactional
      Given the entry claim insert will fail
      When guard "G1" creates a session
      Then the response status is 500
      And no parking session exists for that plate

    @SESSION-006
    Scenario: Claiming sets the entry time
      Given a pending session created 2 minutes ago
      When the owner claims the entry QR
      Then the session status is "ACTIVE"
      And the session entry time is within 5 seconds of the claim time
      And the session entry time is not the creation time

    @SESSION-007
    Scenario: The fee window runs from the entry time to the exit time
      Given an "ACTIVE" session with an entry time 90 minutes ago
      And site "S1" has an effective "HOURLY" policy of 1.00 per hour
      When the fee is calculated for that session
      Then the fee window starts at the entry time
      And the duration reported is 90 minutes

    @SESSION-007
    Scenario: The fee window is measured on the server clock
      Given an "ACTIVE" session with an entry time 30 minutes ago
      When the fee is calculated for that session
      Then the duration is between 30 and 31 minutes
      And the calculation does not use a client-supplied timestamp

    @SESSION-007
    Scenario: The entry time is stored in UTC and displayed in the site timezone
      Given an "ACTIVE" session with an entry time 90 minutes ago
      And site "S1" has timezone "Asia/Phnom_Penh"
      When the session is displayed in the guard dashboard
      Then the entry time is rendered in the "Asia/Phnom_Penh" timezone
      And the stored value is unchanged

    @SESSION-009
    Scenario: A guard can manually activate a never-claimed session
      Given a pending session that has never been claimed
      When guard "G1" manually activates the session
      Then the response status is 200
      And the session status is "ACTIVE"
      And the audit log contains a "session.activated" row naming guard "G1"

    @SESSION-013
    Scenario: The pricing policy version is recorded on the session
      Given site "S1" has effective pricing policy version 3
      When guard "G1" creates a session
      Then the session records pricing policy version 3

    @SESSION-014
    Scenario: The fee snapshot is written at exit completion
      Given an "ACTIVE" session with a fee of 1.00
      When guard "G1" completes the exit
      Then the session records a fee amount of 100 minor units
      And the session records a fee currency of "USD"

    # --------------------------------------------------------------- failure

    @SESSION-008
    Scenario: A completed session cannot be reopened
      Given a "COMPLETED" session
      When guard "G1" attempts to move the session to "ACTIVE"
      Then the response status is 409
      And the error code is "SESSION_INVALID_TRANSITION"

    @SESSION-009
    Scenario: An active session cannot be cancelled
      Given an "ACTIVE" session
      When guard "G1" attempts to cancel the session
      Then the response status is 409
      And the error code is "SESSION_INVALID_TRANSITION"

    @SESSION-003
    Scenario: A client-supplied status is rejected
      Given guard "G1" is at site "S1"
      When guard "G1" creates a session with body field "status" equal to "COMPLETED"
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"
      And the details name the field "status"

    @SESSION-010
    Scenario: Cancelling revokes the pending entry QR
      Given a pending session with a live entry QR
      When guard "G1" cancels the session
      Then the response status is 200
      And claiming that entry QR afterwards returns 410
      And the error code is "CLAIM_CLAIM_REVOKED"

    @SESSION-012
    Scenario: A completed session cannot be completed twice
      Given a "COMPLETED" session
      When guard "G1" attempts to complete the exit again
      Then the response status is 409
      And the error code is "EXIT_ALREADY_COMPLETED"

    @SESSION-005
    Scenario: A missing pepper fails fast
      Given the environment has no plate pepper configured
      When the API starts
      Then the API refuses to start with a configuration error naming "PLATE_PEPPER"

    # ---------------------------------------------------------------- abuse

    @SESSION-003
    Scenario: A client-supplied entry time is ignored
      Given guard "G1" is at site "S1"
      When guard "G1" creates a session with body field "entryAt" set to 30 days in the past
      Then the request is rejected with status 400
      And the stored entry time is null until activation

    @SESSION-005
    Scenario: One motorcycle counts as one guest across many visits
      Given 100 sessions exist for normalized plate "AB123" across 100 different days
      When the admin adoption query counts distinct guests
      Then the distinct guest count is 1
      And the session count is 100

    @SESSION-011
    Scenario: The session list is limited to the actor's sites
      Given a session exists at site "S1"
      And a session exists at site "S2"
      And guard "G2" is assigned to site "S2"
      When guard "G1" lists the sessions of site "S1"
      Then only sessions at site "S1" are returned
      And no session at site "S2" appears in the response

    @SESSION-013 @SESSION-014
    Scenario: A pricing change does not re-price history
      Given a session completed at a fee of 1.00 under pricing policy version 3
      And site "S1" now uses pricing policy version 4 with a fee of 2.00
      When the revenue report for the period is generated
      Then the completed session still reports a fee of 1.00
      And the fee preview for that session still uses version 3
