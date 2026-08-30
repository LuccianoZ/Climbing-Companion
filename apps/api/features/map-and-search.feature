Feature: Map query surface and DB-only name search

  Epic 4 (BL-019 through BL-022) is the first epic with an HTTP-level read
  API: /api/map/* is what the Leaflet map, its pins, its detail panel and
  its search box all read from. This file covers the query half of that
  epic -- what the endpoints return and to whom. The rendering half (pin
  styling, the translucent-grey "Unverified by Community" treatment, and
  in-range action-button visibility) is asserted against a real browser in
  apps/web/features/map-ui.feature, because those are DOM facts, not API
  facts. Both halves together are BL-019-022's Definition of Done.

  The whole read surface is unauthenticated on purpose (Foundation §9: the
  map is the app's public front door), mirroring the precedent set by the
  already-unguarded grade-consensus read.

  # BL-019 / BL-020 / BL-021 / BL-022 -- TestInventory.md `map-and-search.feature`

  Background:
    Given a Verified Climber "sam@example.com" is already registered with password "correct horse battery staple"
    And "sam@example.com" is logged in with password "correct horse battery staple"
    And "sam@example.com" submits a route named "Solar Power" at latitude 37.7338, longitude -119.5676 with these details:
      | discipline           | SPORT_CLIMBING                             |
      | gearRequirements     | QUICKDRAWS,HELMET                          |
      | summary              | Sustained face climbing on good edges.     |
      | proposedGradeOrdinal | 14                                         |
      | boltCount            | 12                                         |
      | minRopeLengthM       | 60                                         |
    And "sam@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8864, longitude -78.8784

  Scenario: The map returns crags and gyms in one list, each tagged with its kind
    When the map pins are requested
    Then the map pins include a "CRAG" named "Solar Power"
    And the map pins include a "GYM" named "Vertical Edge Climbing Gym"

  Scenario: Pins carry the lifecycle status the client needs to style them
    When the map pins are requested
    Then the map pin named "Solar Power" has status "UNVERIFIED"
    And the map pin named "Vertical Edge Climbing Gym" has status "UNVERIFIED"

  Scenario: A VERIFIED pin is distinguishable from an UNVERIFIED one in the payload
    Given the gym "Vertical Edge Climbing Gym" is VERIFIED
    When the map pins are requested
    Then the map pin named "Vertical Edge Climbing Gym" has status "VERIFIED"

  Scenario: Pin coordinates come back as named latitude/longitude, not a GeoJSON pair
    When the map pins are requested
    Then the map pin named "Solar Power" is at latitude 37.7338, longitude -119.5676

  Scenario: A crag whose routes are all archived drops off the map
    Given every route under crag "Solar Power" is ARCHIVED
    When the map pins are requested
    Then the map pins do not include anything named "Solar Power"

  Scenario: An archived gym drops off the map
    Given the gym "Vertical Edge Climbing Gym" is ARCHIVED
    When the map pins are requested
    Then the map pins do not include anything named "Vertical Edge Climbing Gym"

  Scenario: Clicking a crag pin returns its routes with grade and verification progress
    When the detail panel for crag "Solar Power" is requested
    Then the detail panel is for a "CRAG"
    And the detail panel lists 1 route
    And the detail panel route "Solar Power" shows a "PROPOSED" grade of 14
    And the detail panel route "Solar Power" shows 0 of 4 verifications
    And the detail panel route "Solar Power" carries gear requirements "QUICKDRAWS,HELMET"
    And the detail panel route "Solar Power" carries the summary and rope details

  Scenario: The detail panel reflects consensus once 4 grade votes exist
    Given "Solar Power" has these grade votes:
      | gradeOrdinal |
      | 16           |
      | 16           |
      | 16           |
      | 14           |
    When the detail panel for crag "Solar Power" is requested
    Then the detail panel route "Solar Power" shows a "CONSENSUS" grade of 16

  Scenario: The detail panel reports verification progress toward the 4-verifier gate
    Given "Solar Power" already has 2 existing verifications
    When the detail panel for crag "Solar Power" is requested
    Then the detail panel route "Solar Power" shows 2 of 4 verifications

  Scenario: Clicking a gym pin returns disciplines instead of a route list
    Given the gym "Vertical Edge Climbing Gym" offers disciplines "BOULDERING,LEAD"
    When the detail panel for gym "Vertical Edge Climbing Gym" is requested
    Then the detail panel is for a "GYM"
    And the detail panel offers disciplines "BOULDERING,LEAD"
    And the detail panel has no route list

  Scenario: An archived crag's detail panel is unreachable rather than empty
    Given every route under crag "Solar Power" is ARCHIVED
    And the crag "Solar Power" is ARCHIVED
    When the detail panel for crag "Solar Power" is requested
    Then the detail panel request is rejected as not found

  Scenario: Search by name returns coordinates the map can fly to
    When the map is searched for "Solar"
    Then the search results include a "ROUTE" named "Solar Power"
    And the search result "Solar Power" carries latitude 37.7338 and longitude -119.5676
    And the search result "Solar Power" carries the id of its parent crag

  Scenario: Search spans routes, crags and gyms
    When the map is searched for "e"
    Then the search results include a "GYM" named "Vertical Edge Climbing Gym"
    And the search results include a "CRAG" named "Solar Power"

  Scenario: Search is a substring match, not a prefix match
    When the map is searched for "Edge"
    Then the search results include a "GYM" named "Vertical Edge Climbing Gym"

  Scenario: Search excludes archived entries
    Given the gym "Vertical Edge Climbing Gym" is ARCHIVED
    When the map is searched for "Vertical"
    Then the search results are empty

  Scenario: Search does not call any external geocoding service
    Given outbound HTTP calls to external hosts are being recorded
    When the map is searched for "Solar"
    Then the search results include a "ROUTE" named "Solar Power"
    And no outbound call was made to any external host

  Scenario: The whole map read surface is open to an unauthenticated Visitor
    When an unauthenticated Visitor requests the map pins
    Then the map pins include a "CRAG" named "Solar Power"
