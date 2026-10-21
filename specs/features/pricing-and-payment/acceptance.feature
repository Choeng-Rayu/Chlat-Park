# language: en
# Feature: Pricing and payment
# Spec: specs/features/pricing-and-payment/spec.md
# Requirements covered: PRICE-001 … PRICE-012, PAY-001 … PAY-012

  @pricing @payment
  Feature: Pricing policies, fee calculation and manual payment

    Background:
      Given a parking site "S1" owned by owner "O1" with currency "USD"
      And security guard "G1" is assigned to site "S1"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @PRICE-001 @PRICE-002 @PRICE-006
    Scenario: A flat policy charges a fixed amount
      Given site "S1" has an effective "FLAT" policy of 1.50 in "USD"
      And an "ACTIVE" session with an entry time 3 hours ago
      When the fee is calculated for that session
      Then the fee is 150 minor units
      And the fee currency is "USD"
      And the policy version is reported

    @PRICE-007
    Scenario: An hourly policy bills whole hours with a grace period
      Given site "S1" has an effective "HOURLY" policy of 1.00 per hour with a grace period of 10 minutes
      And an "ACTIVE" session with an entry time 70 minutes ago
      When the fee is calculated for that session
      Then the billable duration is 2 hours
      And the fee is 200 minor units

    @PRICE-008
    Scenario: A tiered policy selects exactly one band
      Given site "S1" has an effective "TIERED" policy with bands of 1 hour for 1.00, 4 hours for 3.00, otherwise 5.00
      And an "ACTIVE" session with an entry time 2 hours ago
      When the fee is calculated for that session
      Then the fee is 300 minor units

    @PRICE-004 @PRICE-009
    Scenario: A session keeps the policy version it started with
      Given an "ACTIVE" session created under pricing version 1
      And site "S1" now uses pricing version 2
      When the fee is calculated for that session
      Then the policy version used is 1

    @PRICE-010
    Scenario: The fee is snapshotted at exit completion
      Given an "ACTIVE" session with a fee of 1.50
      When guard "G1" completes the exit
      Then the session fee snapshot is 150 minor units
      And the session fee currency is "USD"

    @PAY-003 @PAY-004
    Scenario: A guard records a cash payment
      Given site "S1" accepts the payment method "CASH"
      And an "ACTIVE" session with a fee of 1.50
      When guard "G1" records a payment of 1.50 in cash with the reason "paid at the gate"
      Then a payment row exists with status "PAID" and amount 150
      And the payment currency is "USD"
      And the payment records the confirming guard and the confirmation time
      And the audit log contains a "payment.recorded" row

    @PAY-006
    Scenario: An owner exempts a fee
      Given owner "O1" holds the permission "site.payments.exempt" for site "S1"
      And an "ACTIVE" session with a fee of 1.50
      When owner "O1" exempts the fee with the reason "monthly subscriber"
      Then a payment row exists with status "EXEMPT"
      And the payment records the exemption reason and the authorizing actor

    @PAY-007
    Scenario: A mistaken cash record is voided explicitly
      Given a "PAID" payment of 1.50 for a session
      When owner "O1" voids the payment with the reason "recorded in the wrong session"
      Then the payment status is "VOIDED"
      And the payment amount is still 150
      And the payment records the void reason and the voiding actor
      And the audit log contains a "payment.voided" row with the original amount

    # --------------------------------------------------------------- failure

    @PRICE-003
    Scenario: A pricing policy cannot be edited in place
      Given site "S1" has pricing version 1
      When an attempt is made to change the amount of version 1
      Then the request is rejected
      And version 1 is unchanged

    @PRICE-006
    Scenario: A negative amount is rejected
      Given owner "O1" is authenticated
      When owner "O1" creates a pricing policy with a negative amount
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"

    @PRICE-011
    Scenario: A client-supplied currency is rejected
      Given an "ACTIVE" session at a "USD" site
      When guard "G1" records a payment with body field "currency" equal to "KHR"
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"

    @PAY-002
    Scenario: A method the site does not accept is rejected
      Given site "S1" accepts only the payment method "CASH"
      When guard "G1" records a payment with method "KHQR_MANUAL"
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"

    @PAY-005
    Scenario: A second paid payment is rejected
      Given a session with a "PAID" payment
      When guard "G1" records another "PAID" payment
      Then the response status is 409
      And the error code is "PAY_ALREADY_PAID"
      And the first payment is unchanged

    @PAY-006
    Scenario: An exemption without the permission is rejected
      Given guard "G1" does not hold the permission "site.payments.exempt"
      When guard "G1" exempts a fee
      Then the response status is 403
      And the error code is "AUTHZ_PERMISSION_DENIED"

    @PAY-007
    Scenario: A void without a reason is rejected
      Given a "PAID" payment
      When owner "O1" attempts to void it without a reason
      Then the response status is 400
      And the payment is still "PAID"

    @PRICE-005
    Scenario: A session that was never claimed has no fee
      Given a "PENDING_CLAIM" session
      When the fee is calculated for that session
      Then the response status is 409
      And the error code is "PRICE_NO_ENTRY_TIME"

    # ---------------------------------------------------------------- abuse

    @PAY-005
    Scenario: Concurrent payments cannot double-settle a session
      Given an "ACTIVE" session with a fee of 1.50
      When 10 "PAID" payment records are submitted at the same instant
      Then exactly one payment row has status "PAID"
      And the other 9 attempts receive status 409

    @PAY-006
    Scenario: Mass exemptions are visible as leakage
      Given 50 sessions at site "S1"
      When guard "G1" exempts all 50 fees, each with a reason
      Then 50 exemption rows exist
      And each has a reason and an authorizing actor
      And the owner report shows the exempt amount separately from the collected amount

    @PAY-007 @PAY-008
    Scenario: A voided payment is excluded from collected revenue
      Given a "PAID" payment of 1.50 that was then voided
      When the revenue report is generated for the period
      Then the collected total does not include 150
      And the voided total includes 150

    @PAY-010
    Scenario: The nightly consistency check finds no mismatches
      Given 1000 payments exist
      When the nightly consistency check runs
      Then it returns zero mismatched rows

    @PAY-012
    Scenario: A receipt screenshot never confirms a payment automatically
      Given an "ACTIVE" session with no payment
      When a receipt image is attached to the session
      Then the session payment status is still "UNPAID"
      And no payment row was created

    @PRICE-001
    Scenario: Pricing versions increase monotonically
      Given site "S1" has pricing versions 1, 2 and 3
      When owner "O1" creates a new pricing policy
      Then its version is 4

    @PRICE-012
    Scenario: A future-dated policy is not used before it takes effect
      Given site "S1" has an effective "FLAT" policy of 1.50
      And a "FLAT" policy of 2.00 that becomes effective tomorrow
      When the fee is calculated for a session today
      Then the fee is 150 minor units
      And the policy version used is the one effective today

    @PRICE-012
    Scenario: A future-dated policy takes effect on its date
      Given site "S1" has an effective "FLAT" policy of 1.50
      And a "FLAT" policy of 2.00 that becomes effective one minute ago
      When the fee is calculated for a session now
      Then the fee is 200 minor units
      And the policy version used is the newer one

    @PAY-001
    Scenario: Amounts are stored as integer minor units
      Given an "ACTIVE" session with a fee of 1.50
      When guard "G1" records a payment of 1.50
      Then the payment amount is the integer 150
      And the payment column is an integer type
      And the payment currency is "USD"

    @PAY-001
    Scenario: A fractional amount is rejected
      Given an "ACTIVE" session with a fee of 1.50
      When guard "G1" records a payment with body field "amountMinor" equal to 150.5
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"

    @PAY-009
    Scenario: A pending or failed payment does not satisfy the payment requirement
      Given an "ACTIVE" session with a fee of 1.50
      And a "PENDING" payment of 150 exists for the session
      When the payment requirement is evaluated
      Then it is not satisfied
      And a "FAILED" payment of 150 also does not satisfy it

    @PAY-009
    Scenario: A voided payment does not satisfy the payment requirement
      Given an "ACTIVE" session with a fee of 1.50
      And a "PAID" payment of 150 that was then voided
      When the payment requirement is evaluated
      Then it is not satisfied

    @PAY-011
    Scenario: A paid payment of at least the fee satisfies the requirement
      Given an "ACTIVE" session with a fee of 1.50
      And a "PAID" payment of 150 exists for the session
      When the payment requirement is evaluated
      Then it is satisfied

    @PAY-011
    Scenario: A paid payment below the fee does not satisfy the requirement
      Given an "ACTIVE" session with a fee of 1.50
      And a "PAID" payment of 100 exists for the session
      When the payment requirement is evaluated
      Then it is not satisfied

    @PAY-011
    Scenario: An exemption satisfies the payment requirement
      Given an "ACTIVE" session with a fee of 1.50
      And an "EXEMPT" payment exists for the session
      When the payment requirement is evaluated
      Then it is satisfied

    @PAY-011
    Scenario: A zero fee is satisfied by any payment state
      Given an "ACTIVE" session with a fee of 0.00
      When the payment requirement is evaluated
      Then it is satisfied
