Feature: Grade voting and live plurality consensus

  A Verified Climber within 300m of a route can vote on its grade, or
  change a prior vote on a return visit (Epic 3, BL-015/BL-016). Until 4
  grade votes exist, the route displays the submitter's own "Proposed
  Grade" estimate -- a display value that is never itself counted as a
  vote. Once 4 votes exist, the displayed grade is the live plurality
  winner (GROUP BY grade_ordinal ORDER BY COUNT(*) DESC, grade_ordinal ASC
  -- ties resolve to the lower grade), recomputed on every read, with no
  freeze cycle. The vote distribution is public, visible even to an
  unauthenticated Visitor.

  # BL-015 / BL-016 -- TestInventory.md `grade-consensus.feature`

  Background:
    Given a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"
    And "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a route named "Sunny Slab" at latitude 42.9100, longitude -78.8700 with these details:
      | discipline           | SPORT_CLIMBING                            |
      | summary              | A route seeded for grade-consensus tests. |
      | proposedGradeOrdinal | 9                                          |

  Scenario: Before 4 votes exist, the route displays the submitter's Proposed Grade
    When the grade consensus for "Sunny Slab" is queried
    Then the consensus response shows source "PROPOSED" and grade 9
    And no route_grade_votes row exists yet for "Sunny Slab"

  Scenario: After 4 votes, the plurality winner becomes the displayed grade
    Given "Sunny Slab" has these grade votes:
      | gradeOrdinal |
      | 10           |
      | 10           |
      | 10           |
      | 9            |
    When the grade consensus for "Sunny Slab" is queried
    Then the consensus response shows source "CONSENSUS" and grade 10
    And the consensus response includes 4 total votes

  Scenario: A tie between two grade ordinals resolves to the lower one
    Given "Sunny Slab" has these grade votes:
      | gradeOrdinal |
      | 12           |
      | 12           |
      | 9            |
      | 9            |
    When the grade consensus for "Sunny Slab" is queried
    Then the consensus response shows source "CONSENSUS" and grade 9

  Scenario: A climber can change their vote on a return visit
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    When "alex@example.com" votes on the grade of "Sunny Slab" as 8 from 50 meters away
    Then the vote succeeds
    When "alex@example.com" votes on the grade of "Sunny Slab" as 12 from 50 meters away
    Then the vote succeeds
    And a route_grade_votes row exists for "alex@example.com" and "Sunny Slab" with grade 12

  Scenario: Voting requires 300m proximity
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    When "alex@example.com" votes on the grade of "Sunny Slab" as 10 from 301 meters away
    Then the vote is rejected with a proximity error

  Scenario: The vote distribution is visible to an unauthenticated Visitor
    Given "Sunny Slab" has these grade votes:
      | gradeOrdinal |
      | 10           |
      | 10           |
      | 9            |
      | 8            |
    When the grade consensus for "Sunny Slab" is queried as an unauthenticated Visitor
    Then the consensus response succeeds
    And the consensus response includes 4 total votes
