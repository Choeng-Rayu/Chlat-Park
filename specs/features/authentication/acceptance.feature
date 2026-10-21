# language: en
# Feature: Authentication
# Spec: specs/features/authentication/spec.md
# Requirements covered: AUTH-001 … AUTH-014

  @auth @auth.login
  Feature: Staff authentication

    Background:
      Given a parking site "S1" owned by owner "O1"
      And a security guard "G1" assigned to site "S1" with the password "correct horse battery staple"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @AUTH-001 @AUTH-002 @AUTH-006
    Scenario: Guard signs in with valid credentials
      Given guard "G1" has status "active"
      When guard "G1" submits email "guard@s1.test" and the correct password
      Then the response status is 200
      And the response contains no "passwordHash" field
      And the audit log contains an "auth.login" row for guard "G1"
      And the audit row records the source IP and the user agent

    @AUTH-004
    Scenario: Successful login sets hardened cookies
      Given guard "G1" has status "active"
      When guard "G1" submits valid credentials
      Then the response sets a cookie "chlat_at" with the attributes "HttpOnly" and "Secure" and "SameSite=Lax"
      And the response sets a cookie "chlat_rt" with the attribute "HttpOnly"
      And the access token expires within 15 minutes
      And the refresh token is stored only as a hash in the database

    @AUTH-005
    Scenario: Refresh rotates the token and invalidates the old one
      Given guard "G1" holds a refresh token "RT1"
      When the client exchanges "RT1" for a new session
      Then the response status is 200
      And a new refresh token "RT2" is issued
      And "RT1" is marked revoked in the database
      And the refresh token family of "RT1" remains active

    @AUTH-009
    Scenario: Logout revokes the session
      Given guard "G1" holds a refresh token "RT1"
      When guard "G1" logs out
      Then the response status is 200
      And the cookies "chlat_at" and "chlat_rt" are cleared
      And "RT1" is marked revoked with reason "logout"
      And the audit log contains an "auth.logout" row for guard "G1"

    @AUTH-012
    Scenario: Session lifetime is capped by role
      Given a super admin "SA1" and a security guard "G1" are both active
      When "SA1" and "G1" each sign in
      Then the refresh token lifetime for "SA1" is at most 4 hours
      And the refresh token lifetime for "G1" is at most 12 hours

    # --------------------------------------------------------------- failure

    @AUTH-007
    Scenario: Unknown email and wrong password are indistinguishable
      Given no user exists with email "nobody@s1.test"
      And guard "G1" exists with email "guard@s1.test"
      When a login is attempted for "nobody@s1.test" with any password
      And a login is attempted for "guard@s1.test" with a wrong password
      Then both responses have status 401
      And both responses have the error code "AUTH_INVALID_CREDENTIALS"
      And both response bodies are identical

    @AUTH-001
    Scenario: A suspended account cannot sign in
      Given guard "G1" has status "suspended"
      When guard "G1" submits valid credentials
      Then the response status is 403
      And the error code is "AUTH_ACCOUNT_SUSPENDED"

    @AUTH-010
    Scenario: Suspension takes effect immediately despite a valid access token
      Given guard "G1" holds a valid access token "AT1"
      When guard "G1" is suspended by the platform administrator
      And guard "G1" sends a request with "AT1"
      Then the response status is 401
      And the error code is "AUTH_TOKEN_STALE"

    @AUTH-014
    Scenario: Expired and tampered tokens are distinguishable
      Given an access token "AT-expired" whose expiry is in the past
      And an access token "AT-tampered" whose signature was altered
      When a request is sent with "AT-expired"
      And a request is sent with "AT-tampered"
      Then the first response status is 401 with the error code "AUTH_TOKEN_EXPIRED"
      And the second response status is 401 with the error code "AUTH_TOKEN_INVALID"

    @AUTH-003
    Scenario: No secret material is echoed
      Given guard "G1" has status "active"
      When guard "G1" submits valid credentials
      Then the response body contains neither the password nor the password hash
      And the application log for that request contains neither the password nor the password hash

    # ---------------------------------------------------------------- abuse

    @AUTH-008
    Scenario: Repeated failed logins are rate limited
      Given 5 failed login attempts have been made for "guard@s1.test" from "10.0.0.5"
      When a 6th attempt is made from "10.0.0.5"
      Then the response status is 429
      And the response contains a "Retry-After" header
      And no password verification was performed for that attempt

    @AUTH-005
    Scenario: Replaying a rotated refresh token kills the session family
      Given guard "G1" holds a refresh token "RT1" that has already been rotated to "RT2"
      When the client exchanges "RT1" again
      Then the response status is 401
      And the error code is "AUTH_REFRESH_REPLAYED"
      And the refresh token "RT2" is revoked
      And the audit log contains an "auth.token_reuse_detected" row

    @AUTH-013
    Scenario: A cookie-authenticated mutation without a CSRF token is rejected
      Given guard "G1" holds a valid session cookie
      When guard "G1" sends a mutating request without the "X-CSRF-Token" header
      Then the response status is 403
      And the error code is "AUTH_CSRF_INVALID"
      And no state was changed

    @AUTH-011
    Scenario: A sensitive action requires recent re-authentication
      Given guard "G1" last authenticated 45 minutes ago
      When guard "G1" attempts to void a payment
      Then the response status is 428
      And the error code is "AUTH_REAUTH_REQUIRED"
      And the payment was not voided

    @AUTH-002
    Scenario: Passwords are stored as Argon2id hashes
      Given guard "G1" has signed in once
      When the "users" table is inspected
      Then the "passwordHash" column contains an Argon2id hash
      And the hash does not contain the plaintext password
      And two users with the same password have different hashes
