# language: en
# Feature: Telegram bot
# Spec: specs/features/telegram-bot/spec.md
# Requirements covered: TG-001 … TG-012
# Status: Planned (P1)

  @telegram @tg
  Feature: Telegram delivery channel

    Background:
      Given a parking site "S1" owned by owner "O1"
      And the API is running with a test database
      And the Telegram module is enabled

    # ---------------------------------------------------------------- normal

    @TG-001 @TG-005
    Scenario: The owner claims a session through the bot
      Given a pending session with a live entry QR
      When the owner sends "/start" with the claim token
      Then exactly one ticket is issued
      And the session status is "ACTIVE"
      And the bot replies with the ticket details

    @TG-003
    Scenario: A duplicate webhook delivery is ignored
      Given a webhook delivery with "update_id" 1001
      When the same delivery is received again
      Then exactly one ticket exists
      And exactly one message was sent
      And the second delivery returned status 200

    @TG-006 @TG-007
    Scenario: The ticket message carries the minimum data and a QR image
      Given a successful claim for plate "AB-123" at site "S1"
      When the bot sends the ticket
      Then the message contains the site name
      And the message contains the plate
      And the message contains the entry time
      And the message contains the ticket reference
      And the message contains no internal session id
      And a QR image is attached
      And the QR image payload contains only the ticket token

    @TG-010
    Scenario: The bot replies in the user's language
      Given a Telegram user whose language is "km"
      When the user sends "/help"
      Then the reply is in Khmer

    @TG-012
    Scenario: A bot-issued ticket is audited with its channel
      Given a successful claim through the bot
      When the audit log is queried
      Then a "ticket.issued" row exists
      And the row records the channel as "telegram"

    # --------------------------------------------------------------- failure

    @TG-002
    Scenario: A webhook with an invalid secret is rejected
      Given a webhook delivery with an invalid secret token
      When it is received
      Then the response status is 401
      And no ticket was issued

    @TG-005
    Scenario: An expired token is reported as expired
      Given a pending session whose entry QR expired
      When the owner sends "/start" with the expired token
      Then the bot replies with the expired message
      And no ticket was issued

    @TG-005
    Scenario: A token claimed on the website is reported as already used
      Given a pending session whose entry QR was already claimed on the website
      When the owner sends "/start" with that token
      Then the bot replies with the already claimed message
      And exactly one ticket exists for the session

    @TG-011
    Scenario: A malformed update is rejected
      Given a webhook delivery whose body is not valid JSON
      When it is received
      Then the response status is 400
      And nothing was processed

    @TG-009
    Scenario: A backend outage produces a friendly message
      Given the API is unavailable
      When a user sends "/help"
      Then the bot replies with the temporary failure message
      And the reply contains no stack trace and no internal error code

    # ---------------------------------------------------------------- abuse

    @TG-002
    Scenario: Forged webhook deliveries are all rejected
      Given 100 webhook deliveries with random secret tokens
      When they are received
      Then every response has status 401
      And no ticket was issued

    @TG-003
    Scenario: Ten deliveries of the same update produce one ticket
      Given a webhook delivery with "update_id" 1001
      When the same delivery is received 10 times
      Then exactly one ticket exists
      And exactly one message was sent

    @TG-008
    Scenario: An unlinked Telegram user cannot read any ticket
      Given a Telegram identity that is not linked to an account
      When the user asks the bot for a ticket
      Then the bot discloses no ticket
      And the bot does not ask for a password

    @TG-004
    Scenario: The bot token never reaches the logs or the client
      Given the bot is enabled
      When the bot handles a command
      Then no application log line contains the bot token
      And the built web client bundle contains no bot token

    @TG-005
    Scenario: The bot applies the same claim rate limit as the website
      Given 20 failed claim attempts from the same IP within a minute
      When the owner claims through the bot from that IP
      Then the claim is rejected with the rate limit message
      And no ticket was issued
