Feature: Minimal friendship (AR-53, BL-x11)

  Pulled forward from Epic 9 (BL-039/040) because Gym Badge/Streak
  visibility (BL-x09/x10) depends on a friend relation existing. Only
  request / accept / decline / unadd is covered here -- directory search
  (BL-041), DMs, and reviews stay Epic 9.

  # BL-x11 -- TestInventory.md `friendship.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"

  Scenario: Sending a friend request creates a PENDING row and notifies the recipient
    When "alex@example.com" sends a friend request to "casey@example.com"
    Then the friend request succeeds
    And a PENDING friendship exists between "alex@example.com" and "casey@example.com"
    And "casey@example.com" has a FRIEND_REQUEST_RECEIVED notification

  Scenario: Accepting flips the friendship to ACTIVE
    Given "alex@example.com" sends a friend request to "casey@example.com"
    When "casey@example.com" accepts the friend request from "alex@example.com"
    Then the friend request succeeds
    And an ACTIVE friendship exists between "alex@example.com" and "casey@example.com"

  Scenario: Only the addressee can accept a friend request
    Given "alex@example.com" sends a friend request to "casey@example.com"
    When "alex@example.com" tries to accept their own request to "casey@example.com"
    Then the friend request is rejected as forbidden

  Scenario: Declining a pending request deletes it silently
    Given "alex@example.com" sends a friend request to "casey@example.com"
    When "casey@example.com" declines the friend request from "alex@example.com"
    Then the friend request succeeds
    And no friendship exists between "alex@example.com" and "casey@example.com"

  Scenario: Unadd on an ACTIVE friendship is unilateral
    Given "alex@example.com" and "casey@example.com" are friends
    When "alex@example.com" unadds "casey@example.com"
    Then the friend request succeeds
    And no friendship exists between "alex@example.com" and "casey@example.com"

  Scenario: A duplicate request in the mirrored direction is rejected
    Given "alex@example.com" sends a friend request to "casey@example.com"
    When "casey@example.com" sends a friend request to "alex@example.com"
    Then the friend request is rejected as a conflict
