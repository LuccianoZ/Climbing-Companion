Feature: Gym submission and verification
  A Verified Climber submits a gym as a standalone pin -- no crag
  relationship, no founding-route concept (Epic 2, Foundation §4). This
  file also owns BL-011 (gym verification) and BL-012 (admin direct
  verification) scenarios.

  BL-011/BL-012 scenarios authenticate the acting climber/admin via the
  X-Test-Mock-Auth bypass header rather than a session cookie, and the
  verifier's physical location via X-Test-Mock-GPS -- the same departure
  route-verification.feature takes and for the same reason (Architecture.md
  AR-16): several concurrently-authenticated actors within one scenario,
  and AuthWorld only ever tracks one active session cookie at a time.

  # BL-007 -- TestInventory.md `gym-submission-and-verification.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And "alex@example.com" is logged in with password "correct horse battery staple"

  Scenario: Submitting a gym creates a standalone gyms row with no crag relationship
    When "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    Then the gym submission succeeds
    And a standalone gym "Vertical Edge Climbing Gym" exists with no crag relationship, status UNVERIFIED, and no disciplines offered yet

  # BL-011 -- TestInventory.md `gym-submission-and-verification.feature`

  Scenario: A Verified Climber within 300m can submit a gym verification with a photo and a discipline
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" verifies gym "Vertical Edge Climbing Gym" from 50 meters away with disciplines "TOP_ROPE"
    Then the gym verification succeeds
    And a gym_verifications row exists for "casey@example.com" and "Vertical Edge Climbing Gym" with disciplines "TOP_ROPE"

  Scenario: Submitting a gym verification with no disciplines selected is rejected as a validation error
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" verifies gym "Vertical Edge Climbing Gym" from 50 meters away with no disciplines selected
    Then the gym verification is rejected as a validation error

  Scenario: The original submitter cannot verify their own gym
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    When "alex@example.com" verifies gym "Vertical Edge Climbing Gym" from 50 meters away with disciplines "TOP_ROPE"
    Then the gym verification is rejected as forbidden

  Scenario: A gym verification attempt from outside the 300m boundary is rejected
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" verifies gym "Vertical Edge Climbing Gym" from 301 meters away with disciplines "TOP_ROPE"
    Then the gym verification is rejected with a proximity error

  Scenario: The 4th unique gym verification flips gyms.status to VERIFIED and unions all four submissions' disciplines
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And "Vertical Edge Climbing Gym" already has 3 existing verifications with disciplines "TOP_ROPE"
    When a 4th unique Verified Climber "casey@example.com" verifies gym "Vertical Edge Climbing Gym" from 50 meters away with disciplines "LEAD, BOULDERING"
    Then gym "Vertical Edge Climbing Gym" becomes VERIFIED
    And gym "Vertical Edge Climbing Gym" offers disciplines "TOP_ROPE, LEAD, BOULDERING"

  # BL-012 -- TestInventory.md `gym-submission-and-verification.feature`

  Scenario: SYSTEM_ADMIN can directly verify a gym, bypassing the 4-verifier gate
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And "root@example.com" is a registered SYSTEM_ADMIN
    When "root@example.com" directly verifies gym "Vertical Edge Climbing Gym" with disciplines "TOP_ROPE, LEAD"
    Then the admin gym verification succeeds
    And gym "Vertical Edge Climbing Gym" becomes VERIFIED
    And gym "Vertical Edge Climbing Gym" was verified directly by an admin
    And gym "Vertical Edge Climbing Gym" offers disciplines "TOP_ROPE, LEAD"

  Scenario: A non-admin cannot call the direct-verify endpoint
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    When "alex@example.com" directly verifies gym "Vertical Edge Climbing Gym" with disciplines "TOP_ROPE"
    Then the admin gym verification is rejected as forbidden
