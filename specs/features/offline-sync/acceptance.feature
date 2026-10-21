# language: en
# Feature: Offline sync
# Spec: specs/features/offline-sync/spec.md
# Requirements covered: SYNC-001 … SYNC-012
# Status: Deferred (Phase 6) — these are NOT MVP acceptance criteria

  @offline @sync
  Feature: Offline event synchronization

    Background:
      Given a parking site "S1" with a local parking service "node-01"
      And the local authority for site "S1" is configured with the central backend
      And the central backend and the local service are running

    # ---------------------------------------------------------------- normal

    @SYNC-001 @SYNC-002 @SYNC-003 @SYNC-005 @SYNC-006
    Scenario: A batch of offline events is applied
      Given the local service has 3 queued events
      When the batch is submitted to the central backend
      Then every event carries a unique event id, the site id, the authority id, an entity reference, an event type, a local timestamp, a sequence number, a schema version, and integrity data
      And every event returns the status "accepted"
      And the central state matches the local state

    @SYNC-003
    Scenario: A repeated event is a duplicate
      Given a batch of 1 event was already applied
      When the same event is submitted again
      Then that event returns the status "duplicate"
      And no state changed

    @SYNC-009
    Scenario: The outbox is written with the state change
      Given a local session was created offline
      When the local database is inspected
      Then the session row exists
      And an outbox row exists for the same transaction

    # --------------------------------------------------------------- failure

    @SYNC-002
    Scenario: An unknown authority is rejected
      Given a batch from an authority id that is not configured
      When the batch is submitted
      Then the response status is 401
      And nothing was applied

    @SYNC-004
    Scenario: An illegal transition is rejected
      Given the central session is "COMPLETED"
      And a local event implies the session becomes "PENDING_CLAIM"
      When the event is submitted
      Then that event returns the status "rejected"
      And the code is "INVALID_TRANSITION"
      And the central session is still "COMPLETED"

    @SYNC-007
    Scenario: A conflict is flagged rather than applied
      Given the central session is "COMPLETED"
      And a local event implies the session is "ACTIVE"
      When the event is submitted
      Then that event returns the status "conflict"
      And the details contain both the central and the local status
      And the central session is unchanged
      And the event appears in the reconciliation queue

    @SYNC-010
    Scenario: The local service recovers after a restart
      Given the local service is killed while 3 events are queued
      When the local service restarts
      Then the outbox still contains 3 events
      And the sync resumes
      And the health view reports a backlog depth of 3

    # ---------------------------------------------------------------- abuse

    @SYNC-008
    Scenario: Replaying a batch does not duplicate anything
      Given a batch of 3 events was applied
      When the same batch is submitted 10 times
      Then exactly one session, one ticket and one payment exist for the affected entities
      And every duplicate submission returns the status "duplicate"

    @SYNC-012
    Scenario: No global revocation is claimed while disconnected
      Given site "S1" is disconnected from the central backend
      When the guard UI shows the sync status
      Then it states that the site is operating locally
      And it does not state that revocations are known globally
      And no ticket is described as globally valid or globally revoked

    @SYNC-006
    Scenario: Every event in a large batch gets a result
      Given a batch of 100 events
      When the batch is processed
      Then the response contains exactly 100 results
      And no event is silently omitted
      And every result carries an event id and a status

    @SYNC-011
    Scenario: An offline ticket verifies against the local session state
      Given an offline ticket was signed with key id "key-2026-01"
      And the local session for that ticket is "ACTIVE"
      When the ticket is verified offline
      Then the signature is valid under "key-2026-01"
      And the local session state allows the exit

    @SYNC-011
    Scenario: A signed ticket whose session is completed does not authorize an exit
      Given an offline ticket was signed with key id "key-2026-01"
      And the local session for that ticket is "COMPLETED"
      When the ticket is verified offline
      Then the signature is valid
      And the exit is not authorized

    @SYNC-011
    Scenario: A tampered offline ticket is rejected
      Given an offline ticket was signed with key id "key-2026-01"
      When the session reference in the payload is changed
      Then the signature verification fails
      And the ticket is rejected

    @SYNC-011
    Scenario: Key rotation keeps the old key valid until its expiry
      Given key id "key-2026-01" was rotated and its "notAfter" has not passed
      And a new key id "key-2026-02" is in use
      When a ticket signed with "key-2026-01" is verified
      Then it is still accepted
      And a ticket signed with "key-2026-02" is also accepted
