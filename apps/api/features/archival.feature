Feature: Archival of unverified routes and gyms past their time window
  Unverified routes and gyms that sit too long without reaching VERIFIED
  are automatically archived, keeping the map/search results clean
  (Foundation, implicit; Epic 2, BL-013). ArchivalService.
  archiveExpiredUnverifiedItems() is a plain, directly-callable method
  (Architecture §9/§19.5) -- these scenarios call it directly rather than
  waiting on its @Cron wrapper's schedule. The window is config-driven --
  5 seconds here under .env.test, 30 days in production -- but every
  scenario below backdates a fixture's created_at well into the past
  instead of sleeping, so the suite's outcome doesn't depend on the exact
  configured window value.

  # BL-013 -- TestInventory.md `archival.feature`

  Background:
    Given a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"
    And "sam@example.com" is logged in with password "correct horse battery staple"

  Scenario: The archival job is directly callable without waiting on a cron tick
    When the archival job runs
    Then the archival job completes with numeric route, gym, and crag counts

  Scenario: An unverified route past the archival window is archived and hidden from map queries
    Given "sam@example.com" submits a route named "Solo Route" at latitude 42.9010, longitude -78.8600 with these details:
      | discipline           | SPORT_CLIMBING                     |
      | summary              | A route seeded for archival tests. |
      | proposedGradeOrdinal | 6                                   |
    And route "Solo Route" is well past the archival window
    When the archival job runs
    Then "Solo Route" status becomes ARCHIVED
    And the visible crags for the map are queried
    And crag "Solo Route" is not among them

  Scenario: An unverified gym past the archival window is archived
    Given "sam@example.com" submits a gym named "Boulder Barn" at latitude 42.9020, longitude -78.8500
    And gym "Boulder Barn" is well past the archival window
    When the archival job runs
    Then "Boulder Barn" status becomes ARCHIVED

  Scenario: Founding route archival cascades the crag even with a verified sibling route
    Given crag "Devil's Hole" is UNVERIFIED with founding route "Warmup Wall"
    And sibling route "Overhang Traverse" under the same crag is already VERIFIED
    And "Warmup Wall" has not reached 4 verifications within the archival window
    When the archival job runs
    Then "Warmup Wall" status becomes ARCHIVED
    And "Devil's Hole" status becomes ARCHIVED
    And "Overhang Traverse" status remains VERIFIED, unreachable via the map since its parent crag is archived

  Scenario: A VERIFIED route or gym is never archived regardless of elapsed time
    Given "sam@example.com" submits a route named "Proven Line" at latitude 42.9030, longitude -78.8400 with these details:
      | discipline           | SPORT_CLIMBING                     |
      | summary              | A route seeded for archival tests. |
      | proposedGradeOrdinal | 12                                  |
    And route "Proven Line" is VERIFIED and well past the archival window
    And "sam@example.com" submits a gym named "Iron Grip Gym" at latitude 42.9040, longitude -78.8300
    And gym "Iron Grip Gym" is VERIFIED and well past the archival window
    When the archival job runs
    Then "Proven Line" status remains VERIFIED
    And "Iron Grip Gym" status remains VERIFIED
