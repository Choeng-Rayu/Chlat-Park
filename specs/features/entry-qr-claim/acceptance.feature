# language: en
# Feature: Entry QR and guest claim
# Spec: specs/features/entry-qr-claim/spec.md
# Requirements covered: CLAIM-001 … CLAIM-014

  @claim @entry-qr
  Feature: Entry QR issuance and guest claim

    Background:
      Given a parking site "S1" owned by owner "O1" with the default entry claim TTL
      And security guard "G1" is assigned to site "S1"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @CLAIM-001 @CLAIM-002
    Scenario: Issuing an entry QR returns the raw token exactly once
      Given guard "G1" is at site "S1"
      When guard "G1" creates a parking session
      Then the response status is 201
      And the response contains a claim token of at least 43 characters
      And the database stores only the SHA-256 hash of that token
      And reading the session again does not return the raw token

    @CLAIM-004
    Scenario: The claim expiry follows the site TTL
      Given site "S1" has an entry claim TTL of 300 seconds
      When guard "G1" creates a parking session
      Then the entry claim expires 300 seconds after the issue time

    @CLAIM-009
    Scenario: A guest claims a valid entry QR
      Given a pending session with a live entry QR
      When the owner claims the entry QR
      Then the response status is 200
      And exactly one ticket exists for the session
      And the session status is "ACTIVE"
      And the session entry time is within 5 seconds of the claim time

    @CLAIM-007 @CLAIM-013
    Scenario: The claim response exposes no internal identifiers
      Given a pending session with a live entry QR
      When the owner claims the entry QR
      Then the response contains a ticket reference and a ticket token
      And the response contains no "sessionId" field
      And the response contains no internal ticket "id" field
      And the response contains no "plateDigest" field

    @CLAIM-011
    Scenario: Reissuing the entry QR rotates the token
      Given a pending session with a live entry QR "T1"
      When guard "G1" reissues the entry QR
      Then a new token "T2" is returned
      And "T1" can no longer be claimed
      And the audit log contains an "entry_claim.reissued" row naming guard "G1"

    @CLAIM-012
    Scenario: Cancelling the session revokes the QR
      Given a pending session with a live entry QR "T1"
      When guard "G1" cancels the session
      Then claiming "T1" afterwards returns 410
      And the error code is "CLAIM_CLAIM_REVOKED"

    # --------------------------------------------------------------- failure

    @CLAIM-005
    Scenario: A claimed token cannot be claimed again
      Given a pending session with a live entry QR "T1"
      And the owner has already claimed "T1"
      When the owner claims "T1" again
      Then the response status is 410
      And the error code is "CLAIM_ALREADY_CLAIMED"
      And still exactly one ticket exists for the session

    @CLAIM-005
    Scenario: An expired token cannot be claimed
      Given a pending session whose entry QR expired 1 minute ago
      When the owner claims the entry QR
      Then the response status is 410
      And the error code is "CLAIM_EXPIRED"

    @CLAIM-006
    Scenario: An unknown token is rejected
      Given a well-formed but unknown token
      When the owner claims it
      Then the response status is 404
      And the error code is "CLAIM_NOT_FOUND"

    @CLAIM-009
    Scenario: A claim against a non-pending session is rejected
      Given a session that was manually activated by a guard
      When the owner claims the entry QR for that session
      Then the response status is 409
      And the error code is "SESSION_INVALID_TRANSITION"

    # ---------------------------------------------------------------- abuse

    @CLAIM-010
    Scenario: Claim attempts are rate limited per IP
      Given 20 failed claim attempts were made from "10.0.0.5" in the last minute
      When a 21st claim attempt is made from "10.0.0.5"
      Then the response status is 429
      And the response contains a "Retry-After" header

    @CLAIM-001
    Scenario: Tokens are unpredictable and unique
      Given 100 entry claims have been issued
      When their raw tokens are inspected
      Then all 100 tokens are distinct
      And no token contains a session id substring
      And no token contains an ISO timestamp substring

    @CLAIM-008
    Scenario: Two simultaneous claims produce one ticket
      Given a pending session with a live entry QR "T1"
      When two claims of "T1" are sent at the same instant
      Then exactly one ticket exists for the session
      And one response has status 200
      And the other response has status 409
      And the other error code is "CLAIM_CONCURRENT_CLAIM"

    @CLAIM-003
    Scenario: The raw token never reaches the logs
      Given a pending session with a live entry QR "T1"
      When the owner claims "T1" and the flow completes
      Then no application log line contains "T1"
      And no audit row contains "T1"

    @CLAIM-014
    Scenario: The QR payload contains only the token
      Given a pending session for plate "AB-123" with a live entry QR
      When the entry QR is decoded
      Then the payload contains the claim token
      And the payload does not contain "AB"
      And the payload does not contain "123"
