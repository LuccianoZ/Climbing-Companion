Feature: Adding more photos to an already-submitted gym or climb (AR-54)

  Fixes two things at once (Sept 7, 2026):
  1. The public detail panel had no way to render a photo gallery -- the map
     read endpoints only ever returned `photosPending: boolean`, never the
     actual approved photo ids. See `map-and-search.feature` for that half.
  2. The original submitter can now add more photos to their own gym or
     climb after the fact, with no upper cap beyond the >= 3 minimum already
     required at submission. Added photos enter moderation PENDING like any
     other upload -- the submitter is not a moderation authority, so this
     does not bypass the Admin Flag Queue.

  Background:
    Given a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"
    And "sam@example.com" is logged in with password "correct horse battery staple"
    And a Verified Climber "casey@example.com" is already registered with password "correct horse battery staple"
    And "sam@example.com" submits a route named "Solar Power" at latitude 37.7338, longitude -119.5676 with these details:
      | discipline           | SPORT_CLIMBING                         |
      | summary              | Sustained face climbing on good edges. |
      | proposedGradeOrdinal | 14                                     |
    And "sam@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8864, longitude -78.8784

  Scenario: The original submitter adds a photo to their own gym, entering PENDING
    When "sam@example.com" adds a photo to gym "Vertical Edge Climbing Gym"
    Then the add-photos request succeeds
    And the detail panel for gym "Vertical Edge Climbing Gym" is requested
    And the detail panel has 0 approved photos

  Scenario: Anyone other than the original submitter is rejected
    When "casey@example.com" adds a photo to gym "Vertical Edge Climbing Gym"
    Then the add-photos request is rejected as forbidden

  Scenario: The original submitter adds a photo to their own climb, entering PENDING
    When "sam@example.com" adds a photo to route "Solar Power"
    Then the add-photos request succeeds
    And the detail panel for crag "Solar Power" is requested
    And the detail panel route "Solar Power" has 0 approved photos

  Scenario: Anyone other than the original submitter is rejected for a climb
    When "casey@example.com" adds a photo to route "Solar Power"
    Then the add-photos request is rejected as forbidden
