# language: en
# Feature: Security controls
# Spec: specs/features/security/spec.md
# Requirements covered: SEC-001 … SEC-018

  @security @cross-cutting
  Feature: Cross-cutting security controls

    Background:
      Given a parking site "S1" owned by owner "O1"
      And security guard "G1" is assigned to site "S1"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @SEC-003
    Scenario: An unknown body field is rejected
      Given guard "G1" is at site "S1"
      When guard "G1" creates a session with an extra body field "status"
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"
      And the details name the field "status"

    @SEC-009
    Scenario: Every response carries a request id
      Given guard "G1" is authenticated
      When guard "G1" makes any API request
      Then the response contains an "X-Request-Id" header
      And the same id appears in the log line for that request

    @SEC-004
    Scenario: Session cookies are hardened
      Given guard "G1" signs in
      Then the session cookies have the attribute "HttpOnly"
      And the session cookies have the attribute "Secure"
      And the session cookies have the attribute "SameSite" equal to "Lax"

    @SEC-007
    Scenario: The response carries a strict content security policy
      Given the API is running
      When any API response is inspected
      Then the "Content-Security-Policy" header is present
      And it does not contain "unsafe-inline"
      And it does not contain "unsafe-eval"

    # --------------------------------------------------------------- failure

    @SEC-013
    Scenario: An internal error does not leak internals
      Given a database failure will occur
      When guard "G1" makes a request
      Then the response status is 500
      And the error code is "INTERNAL_ERROR"
      And the response contains no stack trace
      And the response contains no SQL text
      And the response contains no file path

    @SEC-018
    Scenario: A wrong content type is rejected
      Given guard "G1" is authenticated
      When guard "G1" sends a JSON endpoint request with "Content-Type" equal to "text/plain"
      Then the response status is 415

    @SEC-016
    Scenario: A malformed identifier is rejected
      Given guard "G1" is at site "S1"
      When guard "G1" creates a session with a plate of 200 characters
      Then the response status is 400
      And the error code is "VALIDATION_FAILED"

    # ---------------------------------------------------------------- abuse

    @SEC-001
    Scenario: Plain HTTP is not served
      Given the site is reachable over plain HTTP
      When a request is made over plain HTTP
      Then the response is a redirect to HTTPS or a rejection
      And the HTTPS response contains a "Strict-Transport-Security" header

    @SEC-006
    Scenario: A foreign origin gets no CORS allowance
      Given a request from origin "https://evil.example"
      When the request is made to an API endpoint
      Then the response contains no "Access-Control-Allow-Origin" header
      And the response contains no "Access-Control-Allow-Credentials" header

    @SEC-008
    Scenario: Claim attempts are rate limited
      Given 20 claim attempts were made from "10.0.0.5" in the last minute
      When a 21st claim attempt is made from "10.0.0.5"
      Then the response status is 429
      And the response contains a "Retry-After" header

    @SEC-005
    Scenario: A foreign CSRF token is rejected
      Given guard "G1" holds a valid session cookie
      When guard "G1" sends a mutating request with an "X-CSRF-Token" from another session
      Then the response status is 403
      And the error code is "AUTH_CSRF_INVALID"
      And no state changed

    @SEC-010 @SEC-011
    Scenario: The secret checks pass on the built artefacts
      Given the CI pipeline has built the images
      When the secret scanner and the bundle scan run
      Then no secret is found in the repository
      And no server secret value appears in the client bundle
      And no "NEXT_PUBLIC_" variable name suggests a secret

    @SEC-016
    Scenario: A plate with SQL metacharacters is handled safely
      Given guard "G1" is at site "S1"
      When guard "G1" creates a session with plate "AB'; DROP TABLE parking_sessions; --"
      Then the response is either 201 with the plate stored literally or 400
      And no database error is returned to the client
      And the parking sessions table still exists

    @SEC-012
    Scenario: A full flow leaks no secret into the logs
      Given a complete claim and exit flow has run
      When the application logs and the error responses are inspected
      Then no log line contains a raw claim token
      And no log line contains a raw ticket token
      And no log line contains a password or a cookie
      And no log line contains the readable plate

    @SEC-014
    Scenario: The database is not publicly reachable
      Given the database is running on the private network
      When a connection is attempted from outside that network
      Then the connection is refused

    @SEC-002
    Scenario: No content is served over plain HTTP
      Given the site is reachable over plain HTTP
      When an API request is made over plain HTTP
      Then the request is rejected rather than served
      And no API response body is returned over plain HTTP

    @SEC-015
    Scenario: The dependency audit fails the build on a high advisory
      Given a dependency with a known high severity advisory is present
      When the CI dependency audit runs
      Then the pipeline fails
      And the failing advisory is named

    @SEC-015
    Scenario: The base images are pinned by digest
      Given the Dockerfiles for the web and api applications
      When the image pinning check runs
      Then every base image uses a digest reference
      And no base image uses a floating tag

    @SEC-017
    Scenario: The public allowlist is enforced by the route audit
      Given the reviewed public allowlist in the threat model
      When the route audit test enumerates the route table
      Then every route marked "@Public()" appears in that allowlist
      And every route not in the allowlist is marked with a permission instead

    @SEC-017
    Scenario: A change to the public allowlist is reviewed
      Given a pull request adds a route to the public allowlist
      When the pull request is reviewed
      Then the threat model is updated in the same pull request
