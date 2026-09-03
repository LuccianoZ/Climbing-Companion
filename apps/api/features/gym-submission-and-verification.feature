Feature: Gym submission data and confirm/dispute verification
  A gym is a standalone pin (Foundation §4). After the Sept 3 revision
  (AR-51): a submission carries its disciplines, a full Sunday–Saturday
  hours object and >= 3 photos up front (BL-x04/x05); verification is a
  confirm/dispute step, not data re-entry (BL-x06); and SYSTEM_ADMIN can
  verify a gym directly (BL-012) or author one already VERIFIED from
  anywhere (BL-x03).

  BL-x06/BL-012 scenarios authenticate actors via X-Test-Mock-Auth and the
  verifier's location via X-Test-Mock-GPS (AR-16) -- several concurrent
  identities, and AuthWorld tracks one cookie.

  # BL-x04 / BL-x06 / BL-012 / BL-x03 -- TestInventory.md `gym-submission-and-verification.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And "alex@example.com" is logged in with password "correct horse battery staple"

  Scenario: Submitting a gym creates a standalone pin with disciplines, hours and a derived timezone
    When "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    Then the gym submission succeeds
    And a standalone gym "Vertical Edge Climbing Gym" exists with no crag relationship and status UNVERIFIED

  Scenario Outline: A gym submission missing required data is rejected
    When "alex@example.com" submits a gym named "Incomplete Gym" at 42.8901, -78.8712 omitting <field>
    Then the gym submission is rejected as a validation error

    Examples:
      | field       |
      | disciplines |
      | hours       |
      | photos      |

  Scenario Outline: Every valid weekly-hours shape is accepted
    When "alex@example.com" submits a gym named "Hours Gym" at 42.8901, -78.8712 with a <shape> schedule
    Then the gym submission succeeds

    Examples:
      | shape          |
      | closed-day     |
      | split-shift    |
      | past-midnight  |
      | twenty-four-hr |

  Scenario: "Yes, accurate" within 300m counts, with the photo now optional
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" confirms gym "Vertical Edge Climbing Gym" from 50 meters away without a photo
    Then the gym confirmation succeeds
    And a gym_verifications row exists for "casey@example.com" and "Vertical Edge Climbing Gym"

  Scenario: "No" opens a dispute that does not count toward the four
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" disputes gym "Vertical Edge Climbing Gym" from 50 meters away because "The bouldering wall is closed for renovation."
    Then the gym dispute is recorded
    And no gym_verifications row exists for "casey@example.com" and "Vertical Edge Climbing Gym"
    And gym "Vertical Edge Climbing Gym" has 1 open information dispute
    And the open dispute for gym "Vertical Edge Climbing Gym" says "The bouldering wall is closed for renovation."

  Scenario: A dispute is allowed from just inside 300m and rejected from just outside
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    When "casey@example.com" confirms gym "Vertical Edge Climbing Gym" from 301 meters away
    Then the gym confirmation is rejected with a proximity error

  Scenario: The original submitter cannot confirm their own gym
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    When "alex@example.com" confirms gym "Vertical Edge Climbing Gym" from 50 meters away
    Then the gym confirmation is rejected as forbidden

  Scenario: The 4th confirmation flips the gym to VERIFIED without touching disciplines
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And "Vertical Edge Climbing Gym" already has 3 confirmations
    When a 4th unique Verified Climber "casey@example.com" confirms gym "Vertical Edge Climbing Gym" from 50 meters away
    Then gym "Vertical Edge Climbing Gym" becomes VERIFIED
    And gym "Vertical Edge Climbing Gym" offers disciplines "TOP_ROPE"

  Scenario: A dispute against an already-VERIFIED gym is still allowed
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And "Vertical Edge Climbing Gym" already has 3 confirmations
    And a 4th unique Verified Climber "casey@example.com" confirms gym "Vertical Edge Climbing Gym" from 50 meters away
    And a Verified Climber "morgan@example.com" is already registered with password "correct horse battery staple"
    When "morgan@example.com" disputes gym "Vertical Edge Climbing Gym" from 50 meters away because "Friday hours are wrong."
    Then the gym dispute is recorded

  Scenario: An admin resolves an open gym-information dispute
    Given "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    And "casey@example.com" disputes gym "Vertical Edge Climbing Gym" from 50 meters away because "Wrong phone number."
    And "root@example.com" is a registered SYSTEM_ADMIN
    When "root@example.com" resolves the open dispute for gym "Vertical Edge Climbing Gym"
    Then the dispute resolution succeeds
    And gym "Vertical Edge Climbing Gym" has 0 open information disputes

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

  Scenario: An admin authors a gym already VERIFIED from anywhere
    Given "root@example.com" is a registered SYSTEM_ADMIN
    When "root@example.com" authors a gym named "HQ Boulder Room" 5000 meters from their location with disciplines "BOULDERING"
    Then the gym submission succeeds
    And gym "HQ Boulder Room" becomes VERIFIED
    And gym "HQ Boulder Room" was verified directly by an admin
    And every submission photo for gym "HQ Boulder Room" is APPROVED
