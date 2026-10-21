# language: en
# Feature: Guest ticket
# Spec: specs/features/guest-ticket/spec.md
# Requirements covered: TICKET-001 … TICKET-012

  @ticket @guest
  Feature: E-ticket issuance, display and linking

    Background:
      Given a parking site "S1" owned by owner "O1"
      And security guard "G1" is assigned to site "S1"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @TICKET-001 @TICKET-002
    Scenario: A claim issues exactly one ticket with two identifiers
      Given a pending session with a live entry QR
      When the owner claims the entry QR
      Then exactly one ticket exists for the session
      And the ticket has a public reference of at least 8 characters
      And the ticket has a ticket token
      And the database stores the ticket token as a hash

    @TICKET-004
    Scenario: The ticket payload contains only display data
      Given a ticket for plate "AB-123" at site "S1"
      When the ticket payload is retrieved
      Then the payload contains the site name
      And the payload contains the plate id
      And the payload contains the entry timestamp
      And the payload contains the ticket reference
      And the payload contains the instructions
      And the payload contains no "sessionId"
      And the payload contains no "guardId"
      And the payload contains no "pricingPolicyId"
      And the payload contains no "plateDigest"

    @TICKET-003
    Scenario: A guard can look a ticket up by its reference
      Given a ticket with reference "7K3M-9QX4" at site "S1"
      When guard "G1" enters the reference "7k3m9qx4" at the exit screen
      Then the system resolves the ticket
      And the displayed plate is the ticket's plate
      And the ticket token is not shown to the guard

    @TICKET-005
    Scenario: The ticket fits in one screenshot
      Given a ticket for plate "AB-123"
      When the ticket page is rendered on a 360 by 640 viewport
      Then the QR code is fully visible without scrolling
      And the reference "7K3M-9QX4" is legible

    # --------------------------------------------------------------- failure

    @TICKET-007
    Scenario: A revoked ticket cannot authorize an exit
      Given a ticket that was revoked with the reason "reported stolen"
      When the ticket is presented at the exit
      Then the verification result is "REVOKED"
      And exit is not authorized

    @TICKET-008
    Scenario: Revoking without a reason is rejected
      Given a ticket
      When guard "G1" attempts to revoke the ticket without a reason
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"
      And the ticket is still "ISSUED"

    @TICKET-009
    Scenario: Linking with only the public reference fails
      Given a guest ticket with reference "7K3M-9QX4"
      And a user "U1" is authenticated
      When user "U1" attempts to link the ticket using only the reference
      Then the response status is 403
      And the error code is "TICKET_LINK_UNAUTHORIZED"
      And the ticket is still a guest ticket

    @TICKET-011
    Scenario: An account lists only its own tickets
      Given user "U1" has 3 linked tickets
      And another user "U2" has 1 linked ticket
      When user "U1" lists their tickets
      Then exactly 3 tickets are returned
      And no ticket token appears in the response
      And no ticket belonging to "U2" appears in the response

    # ---------------------------------------------------------------- abuse

    @TICKET-012
    Scenario: A screenshot of a spent ticket does not authorize an exit
      Given a ticket whose session is "COMPLETED"
      When a screenshot of that ticket is presented at the exit
      Then the verification result is "ALREADY_COMPLETED"
      And exit is not authorized

    @TICKET-002
    Scenario: Public references are unique and unambiguous
      Given 1000 tickets have been issued
      When their public references are inspected
      Then all 1000 references are distinct
      And every reference is at least 8 characters long
      And no reference contains the character "O"
      And no reference contains the character "0"
      And no reference contains the character "I"
      And no reference contains the character "1"

    @TICKET-006
    Scenario: The ticket token is not persisted in the browser
      Given a ticket has been claimed
      When the ticket page is loaded in a browser
      Then no ticket token is present in local storage
      And no ticket token is present in session storage
      And no ticket token is present in IndexedDB
      And the ticket page response has a "Cache-Control" header of "no-store"

    @TICKET-009
    Scenario: An unrelated user cannot steal a linked ticket
      Given a guest ticket that was already linked to user "U1"
      And a user "U2" is authenticated
      When user "U2" attempts to link the same ticket
      Then the response status is 409
      And the error code is "TICKET_ALREADY_LINKED"
      And the ticket remains linked to "U1"
      And the audit log contains a "ticket.link_failed" row

    @TICKET-010
    Scenario: Linking does not change the session or the payments
      Given a guest ticket for a session with one recorded payment
      When the ticket is linked to user "U1"
      Then the session id is unchanged
      And the session status is unchanged
      And the ticket issued-at timestamp is unchanged
      And the payment rows are unchanged
      And the ticket's guest user id is now "U1"
