Feature: Checking in at a gym from the map

  BL-024's screen (Epic 5, Sprint 3): the gym-only "Check-In" button
  InRangeActions has rendered since Epic 4, wired to a real request instead
  of the UnbuiltActionSheet placeholder that named it beforehand (AR-36).

  A check-in carries no data of its own beyond "I am here" -- gym_checkins
  has no column a form would populate besides the FKs and timestamp, both
  resolved server-side (Architecture.md §5) -- so this is the simplest of
  the in-range action sheets: one confirm button, no fields, and no
  discipline/grade/photo step the way verification and voting have.

  AR-39: BL-025 (a self-recorded per-facility grade tier, originally scoped
  alongside check-in under this same Epic 5) was cut from scope before
  implementation began. Nothing here asserts a tier field, and none is
  planned.

  # BL-024 / AR-25 / AR-39

  Background:
    Given the climber is signed in
    And the map also shows a gym waiting for verification
    And the climber is standing within range of "Chalk Line Bouldering"

  Scenario: Checking in confirms the visit and reports success
    Given the climber opens the map
    When the climber clicks the pin for "Chalk Line Bouldering"
    And the climber taps "action-check-in"
    Then "check-in-sheet" is on screen
    When the climber taps "check-in-submit"
    Then a POST request reached "/check-ins"
    And "action-success" reads "Checked in"

  Scenario: A check-in carries the climber's own coordinates
    Given the climber opens the map
    When the climber clicks the pin for "Chalk Line Bouldering"
    And the climber taps "action-check-in"
    And the climber taps "check-in-submit"
    Then the check-in request carries the climber's own coordinates

  Scenario: The check-in sheet asks for nothing beyond a confirmation
    Given the climber opens the map
    When the climber clicks the pin for "Chalk Line Bouldering"
    And the climber taps "action-check-in"
    Then the check-in sheet has no free-text notes field

  Scenario: Checking in is refused before the request when the gym is out of range
    Given the climber is standing well outside range of "Chalk Line Bouldering"
    And the climber opens the map
    When the climber clicks the pin for "Chalk Line Bouldering"
    Then "actions-locked" is on screen
    And "action-check-in" is not on screen
    And no request reached "/check-ins"

  Scenario: A signed-out visitor tapping check-in is sent to sign in
    Given the climber is signed out
    And the climber opens the map
    When the climber clicks the pin for "Chalk Line Bouldering"
    And the climber taps "action-check-in"
    Then the browser lands on "/login?next=%2F"
    And no request reached "/check-ins"
