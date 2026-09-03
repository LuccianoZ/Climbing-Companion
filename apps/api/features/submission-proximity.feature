Feature: Non-admin submission proximity gate (AR-51 BL-x02 / §19.4)
  A non-admin dropping a new route or gym pin must place it within 300m of
  their live device location -- checked server-side by PostGIS ST_DWithin on
  geography, so a 301m pin is rejected and a 299m pin is accepted. A
  SYSTEM_ADMIN is exempt (BL-x03): they can site a route or gym from
  anywhere.

  The device location is supplied by X-Test-Mock-GPS under test (AR-16); the
  pin coordinates are projected an exact distance from it with PostGIS so the
  299m/301m pair is a real boundary, not a rounding artefact.

  # BL-x02 -- TestInventory.md `submission-proximity.feature`

  Background:
    Given a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"
    And "root@example.com" is a registered SYSTEM_ADMIN

  Scenario: A route pin 301m from the submitter's location is rejected
    When "sam@example.com" submits a route 301 meters from their location
    Then the proximity submission is rejected with a proximity error
    And no route was created by that submission

  Scenario: A route pin 299m from the submitter's location is accepted
    When "sam@example.com" submits a route 299 meters from their location
    Then the proximity submission succeeds

  Scenario: A gym pin 301m from the submitter's location is rejected
    When "sam@example.com" submits a gym 301 meters from their location
    Then the proximity submission is rejected with a proximity error
    And no gym was created by that submission

  Scenario: A gym pin 299m from the submitter's location is accepted
    When "sam@example.com" submits a gym 299 meters from their location
    Then the proximity submission succeeds

  Scenario: An admin sites a route far from their own location
    When "root@example.com" submits a route 5000 meters from their location
    Then the proximity submission succeeds

  Scenario: An admin sites a gym far from their own location
    When "root@example.com" submits a gym 5000 meters from their location
    Then the proximity submission succeeds
