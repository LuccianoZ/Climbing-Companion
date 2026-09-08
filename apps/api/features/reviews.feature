Feature: Reviews on crags, routes, and gyms (BL-045)

  Epic 9. A review can be left on any crag, route, or gym regardless of its
  lifecycle status (Foundation §12) -- there is no 300m gate and no
  verified/unverified filter. Mandatory text <= 250 chars, screened by the
  §10 profanity gateway; an optional photo moves through the §10 pending
  queue and is only shown once an admin approves it.

  # BL-045 -- TestInventory.md `reviews.feature`

  Background:
    Given a Verified Climber "reviewer@example.com" is already registered with password "correct horse battery staple"
    And a Verified Climber "reader@example.com" is already registered with password "correct horse battery staple"
    And "reviewer@example.com" is logged in with password "correct horse battery staple"
    And "reviewer@example.com" submits a route named "Cathedral Peak" at latitude 37.8510, longitude -119.4050 with these details:
      | discipline           | SPORT_CLIMBING                         |
      | gearRequirements     | QUICKDRAWS,HELMET                      |
      | summary              | Classic alpine granite.               |
      | proposedGradeOrdinal | 8                                     |
      | boltCount            | 10                                    |
      | minRopeLengthM       | 60                                    |
    And "reviewer@example.com" submits a gym named "Granite Arch Gym" at latitude 38.5700, longitude -121.4700

  Scenario: A climber reviews an unverified crag
    When "reviewer@example.com" reviews the crag "Cathedral Peak" saying "Wildly exposed, worth every minute."
    Then the review is created
    And the crag "Cathedral Peak" has 1 review
    And the crag "Cathedral Peak" review list shows "Wildly exposed, worth every minute." by "reviewer@example.com"

  Scenario: A climber reviews a route
    When "reviewer@example.com" reviews the route "Cathedral Peak" saying "The chimney pitch is easier than it looks."
    Then the review is created
    And the route "Cathedral Peak" has 1 review

  Scenario: A climber reviews a gym
    When "reviewer@example.com" reviews the gym "Granite Arch Gym" saying "Great spread of auto-belays for beginners."
    Then the review is created
    And the gym "Granite Arch Gym" has 1 review

  Scenario: Review text is required and capped, and profanity is rejected
    When "reviewer@example.com" reviews the gym "Granite Arch Gym" saying ""
    Then the review is rejected as a validation error
    When "reviewer@example.com" reviews the gym "Granite Arch Gym" with profane text
    Then the review is rejected as a validation error

  Scenario: A review on a target that does not exist is rejected
    When "reviewer@example.com" reviews a crag that does not exist saying "Nope."
    Then the review is rejected as not found

  Scenario: The review list is public and readable by a Visitor
    Given "reviewer@example.com" reviews the gym "Granite Arch Gym" saying "Friendly staff."
    When an unauthenticated Visitor requests the reviews of the gym "Granite Arch Gym"
    Then the review list request succeeds
    And the gym "Granite Arch Gym" has 1 review

  Scenario: A review photo is withheld until an admin approves it
    Given "reviewer@example.com" has uploaded a review photo
    When "reviewer@example.com" reviews the gym "Granite Arch Gym" with that photo saying "See the new lead wall."
    Then the review is created
    And the gym "Granite Arch Gym" review list marks the photo as pending
    When an admin approves the review photo
    And an unauthenticated Visitor requests the reviews of the gym "Granite Arch Gym"
    Then the gym "Granite Arch Gym" review list surfaces the photo id
