Feature: Logging climbs as Completed or Attempted, with a grade snapshot

  A Verified Climber within 300m of a route can log it as Completed or
  Attempted (Epic 3, BL-017/BL-018) -- identical mechanics, only the
  climb_outcome differs. Each log snapshots whatever grade is currently
  displayed for the route at that moment (the live consensus if 4+ votes
  exist, else the submitter's Proposed Grade) into grade_snapshot_ordinal,
  so a later grade-consensus change never rewrites history (Foundation
  §7). No uniqueness constraint -- repeat logging across different visits
  is expected and explicitly supported (BL-018).

  # BL-017 / BL-018 -- TestInventory.md `climb-logging.feature`

  Background:
    Given a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"
    And "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a route named "Practice Wall" at latitude 42.9200, longitude -78.8900 with these details:
      | discipline           | SPORT_CLIMBING                          |
      | summary              | A route seeded for climb-logging tests. |
      | proposedGradeOrdinal | 7                                        |
    And a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"

  Scenario: Logging Completed within 300m snapshots the current grade
    When "alex@example.com" logs "Practice Wall" as COMPLETED from 50 meters away
    Then the log succeeds
    And a climb_logs row exists for "alex@example.com" and "Practice Wall" with outcome "COMPLETED" and grade snapshot 7

  Scenario: Logging Attempted within 300m works identically except for outcome
    When "alex@example.com" logs "Practice Wall" as ATTEMPTED from 50 meters away
    Then the log succeeds
    And a climb_logs row exists for "alex@example.com" and "Practice Wall" with outcome "ATTEMPTED" and grade snapshot 7

  Scenario Outline: Logging from outside 300m is rejected
    When "alex@example.com" logs "Practice Wall" as <outcome> from 301 meters away
    Then the log is rejected with a proximity error

    Examples:
      | outcome   |
      | COMPLETED |
      | ATTEMPTED |

  Scenario: A climber can log the same route as Completed multiple times
    When "alex@example.com" logs "Practice Wall" as COMPLETED from 50 meters away
    And "alex@example.com" logs "Practice Wall" as COMPLETED from 50 meters away
    Then 2 climb_logs rows exist for "alex@example.com" and "Practice Wall" with outcome "COMPLETED"

  Scenario: A later grade-consensus change does not alter an existing log's grade snapshot
    Given "alex@example.com" logs "Practice Wall" as COMPLETED from 50 meters away
    And "Practice Wall" has these grade votes:
      | gradeOrdinal |
      | 11           |
      | 11           |
      | 11           |
      | 10           |
    When the grade consensus for "Practice Wall" is queried
    Then the consensus response shows source "CONSENSUS" and grade 11
    And a climb_logs row exists for "alex@example.com" and "Practice Wall" with outcome "COMPLETED" and grade snapshot 7
