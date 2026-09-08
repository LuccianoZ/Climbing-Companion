Feature: Invite-link friendship (AR-55, BL-040/041)

  Reworked Sept 7, 2026 -- Part 2. Friendship is invite-link-based: a
  climber mints a single-use link (7-day expiry) and sends it out-of-band,
  and the first valid redemption makes the two friends immediately -- no
  pending state, no accept step. The BL-x11 request/accept/decline
  scenarios are replaced by the redemption scenarios below; unadd and the
  AR-5 mirrored-pair check carry over.

  # BL-040/041 -- TestInventory.md `friendship.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"

  Scenario: Redeeming a valid link creates an ACTIVE friendship and notifies the creator
    Given "alex@example.com" creates a friend invite link
    When "casey@example.com" redeems "alex@example.com"'s invite link
    Then the invite redemption succeeds
    And an ACTIVE friendship exists between "alex@example.com" and "casey@example.com"
    And "alex@example.com" has an FRIEND_ADDED notification
    And the invite link is now consumed

  Scenario: A link is single-use -- a second redemption is rejected
    Given "alex@example.com" creates a friend invite link
    And "casey@example.com" has already redeemed "alex@example.com"'s invite link
    When "casey@example.com" redeems "alex@example.com"'s invite link
    Then the invite redemption is rejected as gone

  Scenario: An expired link is rejected
    Given "alex@example.com" creates a friend invite link
    And "alex@example.com"'s invite link has expired
    When "casey@example.com" redeems "alex@example.com"'s invite link
    Then the invite redemption is rejected as gone

  Scenario: A climber cannot redeem their own invite link
    Given "alex@example.com" creates a friend invite link
    When "alex@example.com" redeems "alex@example.com"'s invite link
    Then the invite redemption is rejected as a bad request
    And no friendship exists between "alex@example.com" and "alex@example.com"

  Scenario: Redeeming a link between two people who are already friends is idempotent
    Given "alex@example.com" and "casey@example.com" are friends
    And "alex@example.com" creates a friend invite link
    When "casey@example.com" redeems "alex@example.com"'s invite link
    Then the invite redemption succeeds
    And exactly one friendship exists between "alex@example.com" and "casey@example.com"
    And "alex@example.com" has no FRIEND_ADDED notification

  Scenario: Unadd on an ACTIVE friendship is unilateral
    Given "alex@example.com" and "casey@example.com" are friends
    When "alex@example.com" unadds "casey@example.com"
    Then the unadd succeeds
    And no friendship exists between "alex@example.com" and "casey@example.com"

  Scenario: A friendship blocks a second one via a different link (AR-5 mirrored pair)
    Given "alex@example.com" creates a friend invite link
    And "casey@example.com" has already redeemed "alex@example.com"'s invite link
    And "casey@example.com" creates a friend invite link
    When "alex@example.com" redeems "casey@example.com"'s invite link
    Then the invite redemption succeeds
    And exactly one friendship exists between "alex@example.com" and "casey@example.com"
