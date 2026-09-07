Feature: Outdoor climbing analytics (BL-036/037)

  Lifetime completed climbs split by discipline, attempts rendered as a
  separate series alongside completions (both plotted per grade ordinal),
  and a completion rate (completed / total logs) per discipline. Reads
  climb_logs joined to routes for discipline -- nothing here writes to
  either table.

  # BL-036/037 -- TestInventory.md `analytics.feature`

  Background:
    Given a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"
    And "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a route named "Sport Wall" at latitude 42.9200, longitude -78.8900 with these details:
      | discipline           | SPORT_CLIMBING                     |
      | summary              | A route seeded for analytics tests. |
      | proposedGradeOrdinal | 10                                  |
    And "sam@example.com" submits a route named "Boulder Problem" at latitude 42.9210, longitude -78.8910 with these details:
      | discipline           | BOULDERING                          |
      | summary              | A boulder seeded for analytics tests. |
      | proposedGradeOrdinal | 4                                    |
    And a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"

  Scenario: Completed climbs split correctly by discipline
    When "alex@example.com" logs "Sport Wall" as COMPLETED from 50 meters away
    And "alex@example.com" logs "Boulder Problem" as COMPLETED from 50 meters away
    And "alex@example.com" logs "Boulder Problem" as COMPLETED from 50 meters away
    Then "alex@example.com"'s outdoor analytics for SPORT_CLIMBING shows 1 completed and 0 attempted
    And "alex@example.com"'s outdoor analytics for BOULDERING shows 2 completed and 0 attempted
    And "alex@example.com"'s outdoor analytics for TRADITIONAL_CLIMBING shows 0 completed and 0 attempted

  Scenario: Attempts render as a separate series, not merged into completions
    When "alex@example.com" logs "Sport Wall" as COMPLETED from 50 meters away
    And "alex@example.com" logs "Sport Wall" as ATTEMPTED from 50 meters away
    And "alex@example.com" logs "Sport Wall" as ATTEMPTED from 50 meters away
    Then "alex@example.com"'s outdoor analytics for SPORT_CLIMBING shows 1 completed and 2 attempted

  Scenario: Grade distribution matches the underlying log rows
    When "alex@example.com" logs "Sport Wall" as COMPLETED from 50 meters away
    And "alex@example.com" logs "Sport Wall" as ATTEMPTED from 50 meters away
    Then "alex@example.com"'s outdoor analytics for SPORT_CLIMBING grade distribution at grade 10 shows 1 completed and 1 attempted

  Scenario: Completion rate equals completed divided by total logs
    When "alex@example.com" logs "Sport Wall" as COMPLETED from 50 meters away
    And "alex@example.com" logs "Sport Wall" as COMPLETED from 50 meters away
    And "alex@example.com" logs "Sport Wall" as COMPLETED from 50 meters away
    And "alex@example.com" logs "Sport Wall" as ATTEMPTED from 50 meters away
    Then "alex@example.com"'s outdoor analytics for SPORT_CLIMBING shows a completion rate of 0.75

  Scenario: A discipline with no logs shows a zero completion rate, not an error
    Then "alex@example.com"'s outdoor analytics for TRADITIONAL_CLIMBING shows a completion rate of 0
