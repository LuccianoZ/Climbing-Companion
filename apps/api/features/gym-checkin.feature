Feature: Gym check-in, gated on 300m proximity

  A Verified Climber within 300m of a gym can check in (Epic 5, BL-024),
  writing a gym_checkins row. Architecture.md §5: there is no uniqueness
  constraint on this table -- repeated check-ins across different visits
  are expected, the same "repeats expected" convention climb_logs already
  established (AR-18) rather than route_grade_votes' upsert-on-composite-PK
  shape.

  Sprint 3 / AR-39: BL-025 (a self-recorded per-facility grade tier,
  originally scoped alongside check-in under this same Epic 5) was cut from
  scope before implementation began, so this file covers BL-024 only --
  there is no gym_grade_tiers table or scenario anywhere in this repo.

  # BL-024 -- TestInventory.md `gym-tracking.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And "alex@example.com" is logged in with password "correct horse battery staple"
    And "alex@example.com" submits a gym named "Chalk Line Bouldering" at latitude 42.8950, longitude -78.8750

  Scenario: Checking in within 300m writes a gym_checkins row
    Given a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then the check-in succeeds
    And a gym_checkins row exists for "casey@example.com" and "Chalk Line Bouldering"

  Scenario: Checking in from outside 300m is rejected
    Given a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 301 meters away
    Then the check-in is rejected with a proximity error

  Scenario: A climber can check in at the same gym multiple times
    Given a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    And "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then 2 gym_checkins rows exist for "casey@example.com" and "Chalk Line Bouldering"
