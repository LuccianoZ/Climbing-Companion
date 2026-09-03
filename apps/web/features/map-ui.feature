Feature: The map, its pins, its detail panel and its search box

  The rendering half of Epic 4 (BL-019 through BL-022), plus BL-x01 (the
  Sept 3 status pill). Its sibling file, apps/api/features/map-and-search.feature,
  covers what the endpoints return; this one covers what a climber actually
  sees, in a real browser, driving the real Leaflet map. Pin styling, the
  translucent-grey UNVERIFIED treatment, the italic "Verified" / "Unverified"
  pill and in-range action-button visibility are DOM facts that no API-level
  assertion can stand in for -- which is why this epic could not defer its UI
  the way every prior story did.

  The /api/map/* responses are stubbed (see features/support/fixtures.ts for
  why); everything else -- Leaflet, OSM tiles, the Geolocation API and every
  line of the app -- is real.

  # BL-019 / BL-020 / BL-021 / BL-022 / BL-x01

  Scenario: The map renders over OpenStreetMap tiles
    Given the climber opens the map
    Then a Leaflet map is rendered
    And its tiles are served by OpenStreetMap
    And the map can be panned and zoomed

  Scenario: Leaflet is dynamically imported and does not break server rendering
    When the map page is fetched as raw server HTML
    Then the server HTML contains no Leaflet markup
    And the page still hydrates into a working map in the browser

  Scenario: Crags and gyms render as visually distinct pins
    Given the climber opens the map
    Then a pin for "The Great Wall" is rendered as a "CRAG"
    And a pin for "Vertical Edge Climbing Gym" is rendered as a "GYM"
    And the two pins do not share a silhouette

  Scenario: UNVERIFIED pins render translucent grey with an italic "Unverified" pill
    Given the climber opens the map
    Then the pin for "The Great Wall" is translucent grey
    And the pin for "The Great Wall" carries an italic "Unverified" pill

  Scenario: VERIFIED pins are opaque and carry an italic "Verified" pill
    Given the climber opens the map
    Then the pin for "Vertical Edge Climbing Gym" is fully opaque
    And the pin for "Vertical Edge Climbing Gym" carries an italic "Verified" pill

  Scenario: A pin that becomes VERIFIED flips its pill from Unverified to Verified
    Given the crag "The Great Wall" has been verified by the community
    And the climber opens the map
    Then the pin for "The Great Wall" is fully opaque
    And the pin for "The Great Wall" carries an italic "Verified" pill

  Scenario: The detail panel header and each route row carry the status pill (BL-x01)
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    Then the detail panel header shows an "Unverified" status
    And the route "Solar Power" row shows an "Unverified" status

  Scenario: Clicking a crag pin opens a detail panel with its route fields
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    Then a detail panel for a "CRAG" opens
    And the detail panel shows the route "Solar Power"
    And the route "Solar Power" shows a consensus grade of "5.11a"
    And the route "Solar Power" shows its summary
    And the route "Solar Power" shows 2 of 4 verifications
    And the detail panel shows a vote distribution

  Scenario: Clicking a gym pin opens a panel with disciplines and no route list
    Given the climber opens the map
    When the climber clicks the pin for "Vertical Edge Climbing Gym"
    Then a detail panel for a "GYM" opens
    And the detail panel lists the disciplines "Bouldering" and "Lead"
    And the detail panel shows no route list

  Scenario: In-range action buttons appear when the climber is within 300m
    Given the climber is standing 250 meters from "The Great Wall"
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    Then the in-range action buttons are visible
    And the climber can verify, vote and log a climb

  Scenario: In-range action buttons are hidden when the climber is beyond 300m
    Given the climber is standing 350 meters from "The Great Wall"
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    Then the in-range action buttons are not visible
    And a locked-action explanation is shown instead

  Scenario: With no location at all, actions stay locked
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    Then the in-range action buttons are not visible

  Scenario: The grade scale toggle re-renders grades without a network call
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber switches the grade scale to French
    Then the route "Solar Power" shows a consensus grade of "6c+"
    And no request was made to save a grade preference

  Scenario: Searching by name flies the map to the match
    Given the climber opens the map
    When the climber searches for "Vertical"
    And the climber picks the result "Vertical Edge Climbing Gym"
    Then the map centre moves to the match

  Scenario: Search does not call any external geocoding service
    Given the climber opens the map
    When the climber searches for "Vertical"
    Then results are shown
    And every request the page made went to our own app or its tile provider
