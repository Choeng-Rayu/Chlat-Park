# language: en
# Feature: Exit verification
# Spec: specs/features/exit-verification/spec.md
# Requirements covered: EXIT-001 … EXIT-016

  @exit @verification
  Feature: Exit verification and completion

    Background:
      Given a parking site "S1" owned by owner "O1" with currency "USD"
      And security guard "G1" is assigned to site "S1"
      And a pricing policy version 1 is effective at site "S1"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @EXIT-001 @EXIT-003 @EXIT-004
    Scenario: A guard verifies a valid ticket
      Given an "ACTIVE" session for plate "AB123" at site "S1" with a settled fee
      When guard "G1" verifies the ticket for that session
      Then the verdict is "VALID"
      And the response contains the plate "AB123"
      And the response contains the site name
      And the response contains the entry timestamp
      And the response contains the duration in minutes
      And the response contains the fee amount and currency
      And the response contains the pricing policy version 1
      And the response contains the payment status
      And the response contains the session status
      And the response contains the ticket status

    @EXIT-006 @EXIT-014
    Scenario: A guard completes an exit
      Given an "ACTIVE" session for plate "AB123" with a fee of 1.00
      When guard "G1" authorizes the exit
      Then the response status is 200
      And the session status is "COMPLETED"
      And the session exit time is within 5 seconds of the request
      And the session fee snapshot is 100 minor units
      And the session fee currency is "USD"

    @EXIT-005
    Scenario: A plate mismatch is detected
      Given an "ACTIVE" session for plate "AB123"
      When guard "G1" verifies the ticket and submits the observed plate "AB124"
      Then the verdict is "PLATE_MISMATCH"
      And the response contains the expected plate "AB123"
      And exit is not authorized

    @EXIT-013
    Scenario: A guard can search the site's active sessions by plate
      Given an "ACTIVE" session for plate "AB123" at site "S1"
      When guard "G1" searches for plate "AB" at site "S1"
      Then the response contains the session for plate "AB123"

    @EXIT-012
    Scenario: An owner resolves a manual review
      Given a session in "MANUAL_REVIEW" with an open review case
      And owner "O1" holds the permission "site.review.resolve" for site "S1"
      When owner "O1" resolves the case to "ACTIVE" with the reason "plate confirmed by the guard"
      Then the response status is 200
      And the session status is "ACTIVE"
      And the review case status is "RESOLVED"
      And the audit log contains a "review.resolved" row with the reason

    # --------------------------------------------------------------- failure

    @EXIT-002
    Scenario: A revoked ticket is refused
      Given a ticket that was revoked
      When guard "G1" verifies it
      Then the verdict is "REVOKED"

    @EXIT-002
    Scenario: An expired ticket is refused
      Given a ticket whose validity window has passed
      When guard "G1" verifies it
      Then the verdict is "EXPIRED"

    @EXIT-002
    Scenario: An unknown reference is refused without disclosing anything
      Given a ticket reference that does not exist
      When guard "G1" verifies it
      Then the verdict is "UNKNOWN"
      And the response contains no plate
      And the response contains no entry timestamp

    @EXIT-007
    Scenario: A completed session cannot be completed again
      Given a "COMPLETED" session
      When guard "G1" authorizes the exit
      Then the response status is 409
      And the error code is "EXIT_ALREADY_COMPLETED"
      And the session exit time is unchanged

    @EXIT-009
    Scenario: An unpaid session cannot be completed
      Given an "ACTIVE" session whose payment status is "UNPAID"
      When guard "G1" authorizes the exit
      Then the response status is 409
      And the error code is "EXIT_PAYMENT_REQUIRED"

    @EXIT-009
    Scenario: A pending payment cannot complete the exit
      Given an "ACTIVE" session whose payment status is "PENDING"
      When guard "G1" authorizes the exit
      Then the response status is 409
      And the error code is "EXIT_PAYMENT_REQUIRED"

    @EXIT-010
    Scenario: A guard without the exemption permission cannot exempt a fee
      Given guard "G1" does not hold the permission "site.payments.exempt"
      When guard "G1" attempts to exempt the fee of a session at site "S1"
      Then the response status is 403
      And the error code is "AUTHZ_PERMISSION_DENIED"

    @EXIT-013
    Scenario: A guard cannot search another site's sessions
      Given guard "G1" is assigned only to site "S1"
      When guard "G1" searches for a plate at site "S2"
      Then the response status is 403
      And the error code is "AUTHZ_SCOPE_DENIED"

    # ---------------------------------------------------------------- abuse

    @EXIT-008
    Scenario: Two guards cannot complete the same exit
      Given an "ACTIVE" session with a settled fee
      When two exit completions are sent at the same instant
      Then exactly one response has status 200
      And the other response has status 409
      And exactly one "exit.completed" audit row exists for the session

    @EXIT-015
    Scenario: Every verification attempt is audited
      Given guard "G1" performs 10 verifications
      When the audit log is queried for "exit.verified" rows
      Then 10 rows exist
      And each row names the actor and the verdict

    @EXIT-011
    Scenario: A dispute opens an audited manual review
      Given an "ACTIVE" session for plate "AB123"
      When guard "G1" opens a manual review with the reason "owner disputes the fee" and category "PAYMENT_DISPUTE"
      Then the response status is 201
      And the session status is "MANUAL_REVIEW"
      And a review case exists with the reason "owner disputes the fee"
      And the audit log contains a "review.opened" row

    @EXIT-012
    Scenario: A guard without the resolve permission cannot close a review
      Given a session in "MANUAL_REVIEW" with an open review case
      And guard "G1" does not hold the permission "site.review.resolve"
      When guard "G1" attempts to resolve the case
      Then the response status is 403
      And the review case is still open
      And the session is still in "MANUAL_REVIEW"

    @EXIT-006
    Scenario: A payment voided between verification and completion blocks the exit
      Given an "ACTIVE" session with a "PAID" payment
      And guard "G1" has verified the ticket
      When the payment is voided
      And guard "G1" authorizes the exit
      Then the response status is 409
      And the error code is "EXIT_PAYMENT_REQUIRED"
      And the session is not "COMPLETED"

    @EXIT-016
    Scenario: Verification attempts are rate limited per guard
      Given guard "G1" made 60 verification attempts in the last minute
      When guard "G1" makes one more verification attempt
      Then the response status is 429
      And the response contains a "Retry-After" header

    @EXIT-016
    Scenario: Exit completions are rate limited per guard
      Given guard "G1" made 20 exit completion attempts in the last minute
      When guard "G1" makes one more exit completion attempt
      Then the response status is 429
      And the response contains a "Retry-After" header
      And the session was not completed
