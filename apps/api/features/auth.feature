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
