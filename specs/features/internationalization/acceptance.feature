# language: en
# Feature: Internationalization
# Spec: specs/features/internationalization/spec.md
# Requirements covered: I18N-001 … I18N-010

  @i18n @khmer
  Feature: Khmer and English support

    Background:
      Given a parking site "S1" owned by owner "O1" with timezone "Asia/Phnom_Penh" and currency "USD"
      And security guard "G1" is assigned to site "S1"
      And the API is running with a test database

    # ---------------------------------------------------------------- normal

    @I18N-001 @I18N-002
    Scenario: The guard dashboard renders in Khmer
      Given the locale is "km"
      When guard "G1" opens the entry screen
      Then the page title is the Khmer string for "guard.entry.title"
      And the plate field label is the Khmer string for "guard.entry.plate_label"
      And the confirm button is the Khmer string for "guard.entry.confirm_button"

    @I18N-002
    Scenario: The message catalogue uses the documented key convention
      Given the message catalogue is loaded
      Then every key matches the pattern "<domain>.<section>.<element>"
      And no key contains a dash
      And no key contains a slash
      And no key is camelCase

    @I18N-005
    Scenario: The API error message follows the caller's locale
      Given a request with the "Accept-Language" header equal to "km"
      When a request fails validation
      Then the error message is in Khmer
      And the error code is the same code that would be returned for an English request

    @I18N-007
    Scenario: Times are displayed in the site's timezone
      Given site "S1" has timezone "Asia/Phnom_Penh"
      And a session entered at "2026-10-21T02:12:44Z"
      When the ticket page is rendered
      Then the entry time is shown as "21 Oct 2026, 09:12" or its Khmer equivalent
      And it is not shown in the browser's timezone

    @I18N-008
    Scenario: An amount is rendered from minor units
      Given an amount of 150 minor units in "USD"
      When the amount is displayed
      Then the rendered value is "1.50"
      And it is not "150"

    @I18N-010
    Scenario: Every verdict has a translated label and a non-colour marker
      Given the locale is "km"
      When the exit screen shows the verdict "PLATE_MISMATCH"
      Then a Khmer label is shown
      And an icon or text marker is shown alongside the label
      And the meaning does not depend on the colour alone

    # --------------------------------------------------------------- failure

    @I18N-004
    Scenario: A key missing from Khmer falls back to English
      Given the key "guard.entry.title" exists in English but not in Khmer
      When the key is requested with the locale "km"
      Then the English string is returned
      And no exception is thrown

    @I18N-004
    Scenario: A key missing everywhere returns a visible placeholder
      Given the key "guard.entry.does_not_exist" is in neither catalogue
      When the key is requested
      Then the result contains the key name
      And the result is not an empty string

    @I18N-003
    Scenario: A key parity mismatch fails the build
      Given the Khmer catalogue is missing a key that the English catalogue has
      When the key parity check runs
      Then the check exits with a non-zero status
      And the output names the missing key

    # ---------------------------------------------------------------- abuse

    @I18N-006
    Scenario: The site default beats the browser header
      Given site "S1" has the default language "km"
      And a browser requests the page with the "Accept-Language" header equal to "en"
      When guard "G1" opens the entry screen
      Then the interface is in Khmer

    @I18N-006
    Scenario: An explicit preference wins over everything
      Given the language preference cookie is "en"
      And site "S1" has the default language "km"
      When guard "G1" opens the entry screen
      Then the interface is in English

    @I18N-009
    Scenario: Identifiers are rendered verbatim
      Given a ticket for plate "AB-123" with reference "7K3M-9QX4"
      When the ticket page is rendered with the locale "km"
      Then the plate appears exactly as "AB-123"
      And the reference appears exactly as "7K3M-9QX4"
      And neither is transliterated

    @I18N-005
    Scenario: A malformed language header is tolerated
      Given a request with the "Accept-Language" header equal to "!!invalid!!"
      When the request is made
      Then the response status is not 400
      And the fallback locale is used

    @I18N-003
    Scenario: Adding an English key without a Khmer key fails the build
      Given a pull request adds the key "guard.exit.new_button" to the English catalogue only
      When the CI pipeline runs the key parity check
      Then the pipeline fails
      And the failure names "guard.exit.new_button"
