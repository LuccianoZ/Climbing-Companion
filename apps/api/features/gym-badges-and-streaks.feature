Feature: Gym Badges & Gym Streaks (AR-53, BL-x09/x10)

  A first check-in at a gym permanently earns a badge (that gym's initials
  and the year earned), snapshotted at mint time so it survives the gym
  being later removed from the map. Checking into the same gym in
  consecutive calendar months builds a streak, tracked independently per
  gym. Badges gate on the owner's `badges_public` flag (friends always see
  them regardless); streaks are visible only to the owner and their
  accepted friends, with no public option.

  Replaces the never-implemented BL-038/BL-025 grade tier (AR-39).

  # BL-x09/x10 -- TestInventory.md `analytics.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And "alex@example.com" is logged in with password "correct horse battery staple"
    And "alex@example.com" submits a gym named "Chalk Line Bouldering" at latitude 42.8950, longitude -78.8750
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"

  Scenario: A first check-in mints a badge with the gym's initials and name snapshotted
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then a gym_badges row exists for "casey@example.com" and "Chalk Line Bouldering" with initials "CLB"

  Scenario: A second check-in at the same gym does not mint a second badge
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    And "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then 1 gym_badges row exists for "casey@example.com" and "Chalk Line Bouldering"

  Scenario: A badge survives its gym being permanently deleted
    Given "root@example.com" is a registered SYSTEM_ADMIN
    And "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    When "root@example.com" permanently deletes gym "Chalk Line Bouldering"
    Then the admin delete succeeds
    And the badge snapshot for "casey@example.com" still shows "Chalk Line Bouldering" initials "CLB"

  Scenario: A first check-in starts a streak at 1
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then the streak for "casey@example.com" at "Chalk Line Bouldering" is 1

  Scenario: A second check-in in the same calendar month does not extend the streak
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    And "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then the streak for "casey@example.com" at "Chalk Line Bouldering" is 1

  Scenario: A check-in in the next consecutive calendar month extends the streak
    Given "casey@example.com" has a streak of 3 at "Chalk Line Bouldering" last counted last month
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then the streak for "casey@example.com" at "Chalk Line Bouldering" is 4

  Scenario: A check-in after a skipped month resets the streak to 1
    Given "casey@example.com" has a streak of 5 at "Chalk Line Bouldering" last counted 3 months ago
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then the streak for "casey@example.com" at "Chalk Line Bouldering" is 1

  Scenario: Streaks are tracked independently per gym
    Given "alex@example.com" submits a gym named "Niagara Climbing Center" at latitude 43.0896, longitude -79.0849
    When "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    And "casey@example.com" checks in at gym "Niagara Climbing Center" from 50 meters away
    And "casey@example.com" has a streak of 3 at "Chalk Line Bouldering" last counted last month
    And "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    Then the streak for "casey@example.com" at "Chalk Line Bouldering" is 4
    And the streak for "casey@example.com" at "Niagara Climbing Center" is 1

  Scenario: A non-friend cannot see badges when badges_public is false
    Given "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    And "casey@example.com" sets badges_public to false
    When "alex@example.com" views "casey@example.com"'s gym activity
    Then the returned badge list for "Chalk Line Bouldering" is empty

  Scenario: A non-friend can see badges when badges_public is true
    Given "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    When "alex@example.com" views "casey@example.com"'s gym activity
    Then the returned badge list for "Chalk Line Bouldering" is not empty

  Scenario: A friend can always see badges, even when badges_public is false
    Given "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    And "casey@example.com" sets badges_public to false
    And "alex@example.com" and "casey@example.com" are friends
    When "alex@example.com" views "casey@example.com"'s gym activity
    Then the returned badge list for "Chalk Line Bouldering" is not empty

  Scenario: A non-friend never sees streaks, even when badges_public is true
    Given "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    When "alex@example.com" views "casey@example.com"'s gym activity
    Then the returned streak list is empty

  Scenario: A friend can see streaks
    Given "casey@example.com" checks in at gym "Chalk Line Bouldering" from 50 meters away
    And "alex@example.com" and "casey@example.com" are friends
    When "alex@example.com" views "casey@example.com"'s gym activity
    Then the returned streak list is not empty
