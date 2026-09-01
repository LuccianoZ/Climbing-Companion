Feature: Voting on a grade and logging a climb

  BL-015, BL-017 and BL-018's screens. Both actions are presence-gated and
  both target a route rather than the crag whose panel launched them, so both
  go through the same "which route?" control.

  One thing asserted here is an absence. The approved mockup draws a "Notes
  (Optional)" field on the log sheet and there is deliberately none: climb_logs
  has no note column, LogClimbDto has no such field, and the API's
  ValidationPipe runs forbidNonWhitelisted, so sending one would be a 400.
  Sprint 3 declined the migration outright rather than deferring it (AR-30),
  which makes the absence a decision worth a scenario rather than a gap
  someone re-files as a bug every time they compare screen to mockup.

  # BL-015 / BL-016 / BL-017 / BL-018 / AR-25 / AR-30

  Background:
    Given the climber is signed in
    And the climber is standing within range of "The Great Wall"

  Scenario: A vote comes back as the recomputed consensus
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-vote"
    Then "vote-grade-sheet" is on screen
    When the climber selects "5.11b" in "vote-grade-select"
    And the climber taps "vote-grade-submit"
    Then a POST request reached "/grade-votes"
    And "action-success" reads "community consensus"

  Scenario: The vote sheet says a repeat vote replaces the earlier one
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-vote"
    Then "vote-grade-sheet" reads "replaces your earlier vote"

  Scenario: A vote carries the climber's own coordinates
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-vote"
    And the climber selects "5.11b" in "vote-grade-select"
    And the climber taps "vote-grade-submit"
    Then the body sent to "/grade-votes" carries the climber's coordinates

  Scenario: Logging a climb records the grade as it stood at the time
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-log"
    Then "log-climb-sheet" is on screen
    And "grade-snapshot" reads "Consensus grade snapshot"
    When the climber taps "outcome-COMPLETED"
    And the climber taps "log-climb-submit"
    Then a POST request reached "/climb-logs"
    And "action-success" reads "Logged as completed"

  Scenario: Completed and attempted are one endpoint with a different outcome
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-log"
    And the climber taps "outcome-ATTEMPTED"
    And the climber taps "log-climb-submit"
    Then the body sent to "/climb-logs" has "outcome" set to '"ATTEMPTED"'

  Scenario: The log sheet has no notes field and says so
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-log"
    Then "notes-not-stored" reads "aren't stored"
    And the open sheet has no free-text notes field

  Scenario: With several routes the climber picks which one they climbed
    Given the crag has a second route that is already verified
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-log"
    Then "route-choice" is on screen
    When the climber chooses the route "Sun Salutation"
    And the climber taps "outcome-COMPLETED"
    And the climber taps "log-climb-submit"
    Then the request targeted the route "Sun Salutation"

  Scenario: Logging is refused before the request when the route is out of range
    Given the climber is standing well outside range of "The Great Wall"
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    Then "actions-locked" is on screen
    And "action-log" is not on screen
    And no request reached "/climb-logs"

  Scenario: A signed-out visitor tapping an action is sent to sign in
    Given the climber is signed out
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-log"
    Then the browser lands on "/login?next=%2F"
    And no request reached "/climb-logs"
