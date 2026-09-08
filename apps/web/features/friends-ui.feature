Feature: Invite-link friendship on the frontend (AR-55, BL-040/041)

  Friendship is invite-link-based: no user directory, no request/accept. A
  climber generates a single-use link on their Profile and sends it
  out-of-band; the recipient opens it while signed in and the two are
  connected. Same stub strategy as every web feature (AR-21) -- /api/* is
  fixture-driven, the routing and every line of app code are real.

  # BL-040 / BL-041 -- Epic 9

  Scenario: The Profile tab offers an invite link and shows a shareable URL
    Given the climber is signed in
    When the climber opens "/profile"
    Then "invite-friend" is on screen
    When the climber taps "generate-invite"
    Then "invite-url" is on screen
    And "copy-invite" is on screen

  Scenario: The Profile tab lists your friends with an unadd control
    Given the climber is signed in
    When the climber opens "/profile"
    Then "friends-list" is on screen
    And "unadd-friend" is on screen

  Scenario: With no friends yet, the list says so
    Given the climber is signed in
    And the climber has no friends yet
    When the climber opens "/profile"
    Then "friends-empty" is on screen

  Scenario: A signed-out visitor opening an invite link is sent to sign in
    Given the climber is signed out
    When the climber opens "/friends/invite/demo-invite-token-abc123"
    Then the browser lands on "/login?next=%2Ffriends%2Finvite%2Fdemo-invite-token-abc123"

  Scenario: A signed-in climber redeeming a valid link is told they are now friends
    Given the climber is signed in
    When the climber opens "/friends/invite/demo-invite-token-abc123"
    Then "redeem-success" is on screen
    And "redeem-go-profile" is on screen

  Scenario: A used or expired link explains why it did not work
    Given the climber is signed in
    And the invite link is no longer valid
    When the climber opens "/friends/invite/demo-invite-token-abc123"
    Then "redeem-error" is on screen
    And "redeem-error" reads "no longer valid"

  Scenario: Redeeming your own link is refused with a clear reason
    Given the climber is signed in
    And the invite link is the climber's own
    When the climber opens "/friends/invite/demo-invite-token-abc123"
    Then "redeem-error" is on screen
    And "redeem-error" reads "your own link"
