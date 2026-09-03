Feature: Admin data stewardship (AR-51 BL-x07/x08 + AR-52)
  A SYSTEM_ADMIN can author a route or gym VERIFIED from anywhere (BL-x03),
  edit any field of any gym or climb including its photo set (BL-x07), take
  one off the map either reversibly (force-archive) or permanently
  (hard delete, cascading a founding route to its whole crag), restore an
  archived one, and work the gym-information dispute queue (BL-x08).

  All actions are SYSTEM_ADMIN-only and reached via X-Test-Mock-Auth.

  # BL-x03 / BL-x07 / BL-x08 -- TestInventory.md `admin-stewardship.feature`

  Background:
    Given "root@example.com" is a registered SYSTEM_ADMIN
    And a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"

  Scenario: An admin authors a climb, creating its crag VERIFIED in the same transaction
    When "root@example.com" authors a route named "Corporate Ladder" far from their location
    Then the proximity submission succeeds
    And route "Corporate Ladder" is VERIFIED
    And the crag founded by "Corporate Ladder" is VERIFIED
    And every submission photo for route "Corporate Ladder" is APPROVED

  Scenario: An admin edits a gym's name and disciplines
    Given "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a gym named "Old Name Gym" at latitude 42.8901, longitude -78.8712
    When "root@example.com" edits gym "Old Name Gym" setting name to "New Name Gym" and disciplines "LEAD, SPEED_CLIMBING"
    Then the admin edit succeeds
    And gym "New Name Gym" offers disciplines "LEAD, SPEED_CLIMBING"

  Scenario: An admin swaps a gym's photo set
    Given "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a gym named "Photo Swap Gym" at latitude 42.8901, longitude -78.8712
    When "root@example.com" replaces one photo on gym "Photo Swap Gym" with a fresh upload
    Then the admin edit succeeds
    And gym "Photo Swap Gym" has 3 submission photos
    And every submission photo for gym "Photo Swap Gym" is APPROVED

  Scenario: An admin edit below the 3-photo floor is rejected
    Given "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a gym named "Floor Gym" at latitude 42.8901, longitude -78.8712
    When "root@example.com" tries to leave gym "Floor Gym" with only 2 photos
    Then the admin edit is rejected as a validation error

  Scenario: Force-archive hides a gym reversibly; restore brings it back
    Given "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a gym named "Toggle Gym" at latitude 42.8901, longitude -78.8712
    When "root@example.com" force-archives gym "Toggle Gym"
    Then gym "Toggle Gym" status is ARCHIVED
    And the admin editor still shows gym "Toggle Gym"
    When "root@example.com" restores gym "Toggle Gym"
    Then gym "Toggle Gym" status is UNVERIFIED

  Scenario: Permanently deleting a gym removes the row
    Given "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a gym named "Doomed Gym" at latitude 42.8901, longitude -78.8712
    When "root@example.com" permanently deletes gym "Doomed Gym"
    Then the admin delete succeeds
    And no gym named "Doomed Gym" exists

  Scenario: Permanently deleting a founding route takes its whole crag with it
    Given "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a route named "Keystone" at latitude 44.5000, longitude -110.0000 with these details:
      | discipline           | SPORT_CLIMBING                     |
      | summary              | The founding route of a doomed crag. |
      | proposedGradeOrdinal | 12                                |
    When "root@example.com" permanently deletes route "Keystone"
    Then the admin delete succeeds
    And route "Keystone" no longer exists
    And the crag founded by "Keystone" no longer exists

  Scenario: A non-admin cannot reach any stewardship endpoint
    Given "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a gym named "Guarded Gym" at latitude 42.8901, longitude -78.8712
    When "sam@example.com" tries to permanently delete gym "Guarded Gym"
    Then the admin delete is rejected as forbidden
