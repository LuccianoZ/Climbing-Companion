Feature: Submitting a route and submitting a gym

  BL-006 and BL-007's screens. The API for both has been green since Sprint 1;
  what was missing was any way for a person to reach it.

  Most of what is asserted below is about the form refusing to build a request
  the server would reject. Architecture section 3 forbids bolt count and
  minimum rope length on a Bouldering route with a Postgres CHECK, mirrored by
  a cross-field validator in SubmitRouteDto -- so a form that collected them
  anyway would let someone fill in eight fields and then meet a 400. The
  fields are therefore removed rather than disabled, and the keys are omitted
  from the payload rather than sent as nulls.

  # BL-006 / BL-007 / BL-023

  Background:
    Given the climber is signed in
    And the climber is standing within range of "The Great Wall"

  Scenario: Choosing Bouldering removes the bolt and rope fields
    Given the climber has opened "/submit-route"
    Then "rope-details" is on screen
    When the climber taps "discipline-BOULDERING"
    Then "rope-details" is not on screen

  Scenario: A Bouldering submission omits the rope fields entirely
    Given the climber has opened "/submit-route"
    When the climber taps "discipline-BOULDERING"
    And the climber fills "name" with "The Pink One in the Corner"
    And the climber selects "V4" in "grade-select"
    And the climber taps "use-my-location"
    And the climber fills "summary" with "Sit start, big move off the undercling."
    And the climber uploads the required submission photos
    And the climber taps "submit-route"
    Then a POST request reached "/api/routes"
    And the body sent to "/api/routes" has no "boltCount" field
    And the body sent to "/api/routes" has no "minRopeLengthM" field
    And the body sent to "/api/routes" has "discipline" set to '"BOULDERING"'

  Scenario: A Sport submission carries the bolt count and rope length it was given
    Given the climber has opened "/submit-route"
    When the climber fills "name" with "Solar Power"
    And the climber selects "5.11a" in "grade-select"
    And the climber taps "use-my-location"
    And the climber fills "boltCount" with "12"
    And the climber fills "minRopeLengthM" with "60"
    And the climber fills "summary" with "Sustained face climbing, crux at the third bolt."
    And the climber uploads the required submission photos
    And the climber taps "submit-route"
    Then the body sent to "/api/routes" has "boltCount" set to "12"
    And the body sent to "/api/routes" has "minRopeLengthM" set to "60"

  Scenario: Gear requirements are submitted as names, not icons
    Given the climber has opened "/submit-route"
    When the climber fills "name" with "Solar Power"
    And the climber selects "5.11a" in "grade-select"
    And the climber taps "use-my-location"
    And the climber fills "summary" with "Bolted face, bring a helmet for the ledge."
    And the climber taps "gear-option-QUICKDRAWS"
    And the climber taps "gear-option-HELMET"
    And the climber uploads the required submission photos
    And the climber taps "submit-route"
    Then the body sent to "/api/routes" has "gearRequirements" set to '["QUICKDRAWS","HELMET"]'

  Scenario: Gear left untouched is omitted rather than sent empty
    Given the climber has opened "/submit-route"
    When the climber fills "name" with "Solar Power"
    And the climber selects "5.11a" in "grade-select"
    And the climber taps "use-my-location"
    And the climber fills "summary" with "Nothing but bolts and good edges."
    And the climber uploads the required submission photos
    And the climber taps "submit-route"
    Then the body sent to "/api/routes" has no "gearRequirements" field

  Scenario: The grade list follows the chosen discipline
    Given the climber has opened "/submit-route"
    Then the grade list offers "5.11a"
    And the grade list does not offer "V4"
    When the climber taps "discipline-BOULDERING"
    Then the grade list offers "V4"
    And the grade list does not offer "5.11a"

  Scenario: Nothing is sent until the pin has actually been placed
    Given the climber has opened "/submit-route"
    When the climber fills "name" with "Solar Power"
    And the climber selects "5.11a" in "grade-select"
    And the climber fills "summary" with "Sustained face climbing."
    And the climber taps "submit-route"
    Then "field-error-location" is on screen
    And no request reached "/api/routes"

  Scenario: Founding a new crag is reported back to the submitter
    Given the climber has opened "/submit-route"
    When the climber fills "name" with "First Light"
    And the climber selects "5.11a" in "grade-select"
    And the climber taps "use-my-location"
    And the climber fills "summary" with "Morning sun, clean rock, two bolts to the ledge."
    And the climber uploads the required submission photos
    And the climber taps "submit-route"
    Then "submit-route-success" is on screen
    And "crag-outcome" reads "No crag existed within 300m"

  Scenario: The pin can only be dragged inside the 300m circle
    Given the climber has opened "/submit-route"
    Then "location-picker-hint" reads "within 300m"

  # AR-51 BL-x04: a gym now carries disciplines, weekly hours and >= 3 photos.
  Scenario: A gym submission carries its disciplines, hours and photos
    Given the climber has opened "/submit-gym"
    Then "submit-gym-form" is on screen
    And "grade-select" is not on screen
    And "operating-hours" is on screen
    When the climber fills "name" with "Chalk Line Bouldering"
    And the climber taps "use-my-location"
    And the climber taps "gym-discipline-BOULDERING"
    And the climber uploads the required submission photos
    And the climber taps "submit-gym"
    Then a POST request reached "/api/gyms"
    And the body sent to "/api/gyms" has "disciplinesOffered" set to '["BOULDERING"]'
    And "submit-gym-success" is on screen

  Scenario: A gym cannot be submitted without a discipline
    Given the climber has opened "/submit-gym"
    When the climber fills "name" with "Chalk Line Bouldering"
    And the climber taps "use-my-location"
    And the climber uploads the required submission photos
    And the climber taps "submit-gym"
    Then no request reached "/api/gyms"

  Scenario: The floating plus is hidden from a signed-out visitor
    Given the climber is signed out
    When the climber opens "/"
    Then "submit-fab" is not on screen
