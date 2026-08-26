Feature: Route verification with 300m physical-proximity and grade voting
  A Verified Climber physically at a route can verify it with a photo and a
  grade vote (Epic 2, BL-009/BL-010/BL-014). The three-part transaction
  (Architecture §4): insert the verification row, upsert the matching
  route_grade_votes row, and check the running count -- the 4th unique
  verification flips the route to VERIFIED and, when the route is its
  crag's founding route, cascades the crag to VERIFIED in the same
  transaction (BL-010). The 299m/301m pair (BL-014) proves the 300m
  ST_DWithin buffer is real, not a no-op.

  Architecture.md AR-16: the verifier's own physical location is supplied
  either by the browser Geolocation API in production, or by the
  X-Test-Mock-GPS header under test. Scenarios below also authenticate the
  acting climber via X-Test-Mock-Auth rather than a session cookie, since
  (unlike every other feature file so far) this one needs several
  concurrently-authenticated actors within a single scenario -- the route's
  submitter plus one or more independent verifiers -- and AuthWorld only
  ever tracks one active session cookie at a time.

  # BL-009 / BL-010 / BL-014 -- TestInventory.md `route-verification.feature`

  Background:
    Given a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"
    And "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a route named "Higher Ground" at latitude 42.8864, longitude -78.8784 with these details:
      | discipline           | SPORT_CLIMBING                              |
      | summary              | A route seeded for verification scenarios. |
      | proposedGradeOrdinal | 10                                          |
    And a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"

  Scenario: A verification within 300m with a photo and grade vote writes both rows in one transaction
    When "alex@example.com" verifies "Higher Ground" from 50 meters away with grade vote 11
    Then the verification succeeds
    And a route_verifications row exists for "alex@example.com" and "Higher Ground"
    And a route_grade_votes row exists for "alex@example.com" and "Higher Ground" with grade 11

  Scenario: The original submitter cannot verify their own route
    When "sam@example.com" verifies "Higher Ground" from 50 meters away with grade vote 11
    Then the verification is rejected as forbidden

  Scenario: A user cannot verify the same route twice
    Given "alex@example.com" has already verified "Higher Ground"
    When "alex@example.com" verifies "Higher Ground" from 50 meters away with grade vote 11
    Then the verification is rejected with a clean 4xx, not a 500

  Scenario: Once VERIFIED, the verify action is unavailable for that route
    Given "Higher Ground" already has 4 verifications and is VERIFIED
    When a fifth Verified Climber "riley@example.com" verifies "Higher Ground" from 50 meters away with grade vote 11
    Then the verification is rejected as a conflict

  Scenario: A verification attempt from just outside the 300m boundary is rejected
    When "alex@example.com" verifies "Higher Ground" from 301 meters away with grade vote 11
    Then the verification is rejected with a proximity error
    And no route_verifications row exists for "alex@example.com" and "Higher Ground"
    And the verification count for "Higher Ground" remains 0

  Scenario: A verification attempt from just inside the 300m boundary succeeds
    When "alex@example.com" verifies "Higher Ground" from 299 meters away with grade vote 11
    Then the verification succeeds
    And a route_verifications row exists for "alex@example.com" and "Higher Ground"

  Scenario: Verifying the founding route cascades the crag to VERIFIED
    Given "Higher Ground" already has 3 existing verifications
    When a 4th unique Verified Climber "casey@example.com" verifies "Higher Ground" from 50 meters away with grade vote 11
    Then "Higher Ground" becomes VERIFIED
    And the crag for "Higher Ground" becomes VERIFIED

  Scenario: A non-founding route verifying does not cascade the crag
    Given "alex@example.com" is logged in with password "correct horse battery staple"
    And "alex@example.com" submits a route named "Overhang Traverse" at latitude 42.8864, longitude -78.8784 with these details:
      | discipline           | BOULDERING                          |
      | summary              | A short, powerful traverse problem. |
      | proposedGradeOrdinal | 4                                    |
    And "Overhang Traverse" already has 3 existing verifications
    When a 4th unique Verified Climber "casey@example.com" verifies "Overhang Traverse" from 50 meters away with grade vote 11
    Then "Overhang Traverse" becomes VERIFIED
    And the crag for "Overhang Traverse" remains UNVERIFIED
