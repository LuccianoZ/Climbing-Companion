Feature: Authentication
  Registration and login for the Climbing Companion auth core (Epic 1).

  # BL-001 -- TestInventory.md `auth.feature`

  Scenario: Register with valid email and password creates a users row with an argon2id hash, not plaintext
    When a visitor registers with email "alex@example.com", password "correct horse battery staple", and display name "Alex"
    Then the registration succeeds
    And the stored user has role "VERIFIED_USER"
    And the stored password hash is an argon2id hash, not the plaintext password

  Scenario: Register with a duplicate email is rejected
    Given a Verified Climber "alex@example.com" is already registered
    When a visitor registers with email "alex@example.com", password "a completely different password", and display name "Alex Two"
    Then the registration is rejected as a conflict
    And no second users row is written for "alex@example.com"

  # BL-002 -- TestInventory.md `auth.feature`

  Scenario: Login with correct credentials sets the HTTP-Only/Secure/SameSite=Strict session cookie
    Given a Verified Climber "jordan@example.com" is already registered with password "correct horse battery staple"
    When "jordan@example.com" logs in with password "correct horse battery staple"
    Then the login succeeds
    And the response sets a session cookie that is HttpOnly, Secure, and SameSite=Strict

  Scenario: Login with wrong password is rejected, no cookie set
    Given a Verified Climber "jordan@example.com" is already registered with password "correct horse battery staple"
    When "jordan@example.com" logs in with password "totally the wrong password"
    Then the login is rejected as unauthorized
    And no session cookie is set

  # BL-003 -- TestInventory.md `auth.feature`

  Scenario: Logout clears the session cookie
    Given a Verified Climber "jordan@example.com" is already registered with password "correct horse battery staple"
    And "jordan@example.com" is logged in with password "correct horse battery staple"
    When "jordan@example.com" logs out
    Then the logout succeeds
    And the response clears the session cookie
    And an authenticated request with the old session cookie is rejected

  # BL-004 -- TestInventory.md `auth.feature`

  Scenario: Password reset link commits a new hash and invalidates the token
    Given a Verified Climber "jordan@example.com" is already registered with password "correct horse battery staple"
    When "jordan@example.com" requests a password reset
    Then a password reset email is sent to "jordan@example.com" with a reset link
    When the reset link is used to set a new password "a brand new password"
    Then the password reset succeeds
    And "jordan@example.com" can log in with password "a brand new password"
    And "jordan@example.com" can no longer log in with password "correct horse battery staple"
    When the same reset link is used again to set a new password "yet another password"
    Then the password reset is rejected as unauthorized

  # BL-005 -- TestInventory.md `auth.feature` (fail-closed conditions themselves
  # are covered by Vitest -- see test-bypass.module.spec.ts / bootstrap-guard.spec.ts
  # -- since they concern module registration and process bootstrap, not HTTP
  # behavior this already-running test-configured app can exercise.)

  Scenario: X-Test-Mock-Auth authenticates as the given user only when both bypass conditions hold
    Given a Verified Climber "morgan@example.com" is already registered with password "correct horse battery staple"
    When "morgan@example.com" is authenticated via the X-Test-Mock-Auth bypass header
    Then the bypassed request is authenticated as "morgan@example.com"
