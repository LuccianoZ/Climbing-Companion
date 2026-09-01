Feature: Registering, signing in, signing out and resetting a password

  The screens for BL-001 through BL-004, whose backends have been green since
  Sprint 1 and which shipped with "UI review -- deferred" in every Definition
  of Done. Its sibling file, apps/api/features/auth.feature, proves what the
  endpoints do; this one proves what a climber sees and what the app sends.

  Two things here are behaviours rather than decoration, and both would be
  easy to break silently: registration must sign the new climber in without a
  second password prompt (AR-23), and the password-reset screen must answer
  identically whether or not the address has an account -- the enumeration
  protection AuthService deliberately builds in (AR-12) is only real if the UI
  holds the same line.

  # BL-001 / BL-002 / BL-003 / BL-004

  Scenario: The gateway is one card with a Login and Register switch
    Given the climber is signed out
    When the climber opens "/login"
    Then "auth-form" is on screen
    And the auth card is in "login" mode
    And "mode-register" is on screen

  Scenario: Signing in returns the climber to the map
    Given the climber is signed out
    And the climber has opened "/login"
    When the climber fills "email" with "alex@example.com"
    And the climber fills "password" with "correct-horse"
    And the climber taps "auth-submit"
    Then a POST request reached "/api/auth/login"
    And the browser lands on "/"

  Scenario: A rejected sign-in is explained without repeating the server
    Given the climber is signed out
    And the server refuses "auth-login" with 401 and the message "Invalid email or password"
    And the climber has opened "/login"
    When the climber fills "email" with "alex@example.com"
    And the climber fills "password" with "wrong"
    And the climber taps "auth-submit"
    Then "form-error" reads "not recognised"
    And the message in "form-error" does not quote the server

  Scenario: Registering signs the new climber in without asking twice
    Given the climber is signed out
    And the climber has opened "/register"
    When the climber fills "email" with "new@example.com"
    And the climber fills "displayName" with "New Climber"
    And the climber fills "password" with "longenough1"
    And the climber fills "confirmPassword" with "longenough1"
    And the climber taps "auth-submit"
    Then a POST request reached "/api/auth/register"
    And a POST request reached "/api/auth/login"
    And the browser lands on "/"

  Scenario: Registration asks for the display name the mockup leaves out
    Given the climber is signed out
    And the climber has opened "/register"
    When the climber fills "email" with "new@example.com"
    And the climber fills "password" with "longenough1"
    And the climber fills "confirmPassword" with "longenough1"
    And the climber taps "auth-submit"
    Then "field-error-displayName" is on screen
    And no request reached "/api/auth/register"

  Scenario: Mismatched passwords are caught before any request
    Given the climber is signed out
    And the climber has opened "/register"
    When the climber fills "email" with "new@example.com"
    And the climber fills "displayName" with "New Climber"
    And the climber fills "password" with "longenough1"
    And the climber fills "confirmPassword" with "longenough2"
    And the climber taps "auth-submit"
    Then "field-error-confirmPassword" is on screen
    And no request reached "/api/auth/register"

  Scenario: A password shorter than the server accepts is caught before the request
    Given the climber is signed out
    And the climber has opened "/register"
    When the climber fills "email" with "new@example.com"
    And the climber fills "displayName" with "New Climber"
    And the climber fills "password" with "short"
    And the climber fills "confirmPassword" with "short"
    And the climber taps "auth-submit"
    Then "field-error-password" is on screen
    And no request reached "/api/auth/register"

  Scenario: Logging out reaches the server rather than only the browser
    Given the climber is signed in
    And the climber has opened "/"
    When the climber taps "header-menu-button"
    And the climber taps "menu-logout"
    Then a POST request reached "/api/auth/logout"

  Scenario: A password reset never reveals whether the account exists
    Given the climber is signed out
    And the climber has opened "/forgot-password"
    When the climber fills "email" with "stranger@example.com"
    And the climber taps "send-reset-link"
    Then a POST request reached "/api/auth/password-reset/request"
    And "form-notice" reads "If an account exists"

  Scenario: A reset page reached without a token asks for a fresh link
    Given the climber is signed out
    When the climber opens "/reset-password"
    Then "reset-missing-token" is on screen
    And "request-new-link" is on screen
    And no request reached "/api/auth/password-reset/confirm"

  Scenario: Signing in from a guarded page returns you to that page
    Given the climber is signed out
    When the climber opens "/submit-route"
    Then the browser lands on "/login?next=%2Fsubmit-route"
