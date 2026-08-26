Feature: Route submission and crag creation
  A Verified Climber submits a route; a crag is created automatically if
  none exists nearby, or the route attaches to one that does (Epic 2,
  BL-006). Foundation §4 / Architecture §3: crag creation is never a
  standalone action -- there is no "create crag" endpoint.

  # BL-006 -- TestInventory.md `route-submission-and-crag-creation.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And "alex@example.com" is logged in with password "correct horse battery staple"

  Scenario: Submitting a route with no crag within 300m creates both a crag and a route, with founding_route_id set
    When "alex@example.com" submits a route named "Warmup Wall" at latitude 42.8864, longitude -78.8784 with these details:
      | discipline           | SPORT_CLIMBING                                            |
      | summary              | A pleasant warmup route with good exposure near the top. |
      | proposedGradeOrdinal | 10                                                         |
      | boltCount            | 8                                                          |
    Then the submission succeeds
    And a new crag is created whose founding route is "Warmup Wall"

  Scenario: Submitting a route within 300m of an existing crag attaches it as a non-founding child, leaving the crag untouched
    Given a crag "Devil's Hole" already exists at latitude 42.8864, longitude -78.8784 with founding route "Anchor Point"
    When "alex@example.com" submits a route named "Overhang Traverse" at latitude 42.8865, longitude -78.8783 with these details:
      | discipline           | BOULDERING                          |
      | summary              | A short, powerful traverse problem. |
      | proposedGradeOrdinal | 4                                    |
    Then the submission succeeds
    And "Overhang Traverse" is attached to crag "Devil's Hole" as a non-founding child
    And crag "Devil's Hole" is still UNVERIFIED with founding route "Anchor Point"

  Scenario: A crag with zero non-archived routes never appears in map query results
    Given a crag "Forgotten Slab" already exists at latitude 43.0, longitude -79.0 with founding route "Faded Line"
    And every route under crag "Forgotten Slab" is ARCHIVED
    When the visible crags for the map are queried
    Then crag "Forgotten Slab" is not among them

  Scenario: Route submission requires all mandatory fields
    When "alex@example.com" submits a route named "" at latitude 42.8864, longitude -78.8784 with these details:
      | discipline           | SPORT_CLIMBING |
      | summary              |                |
      | proposedGradeOrdinal |                |
    Then the submission is rejected as a validation error

  Scenario Outline: Bolt count and minimum rope length are accepted for Sport/Trad and rejected for Bouldering
    When "alex@example.com" submits a route named "<name>" at latitude 42.8864, longitude -78.8784 with these details:
      | discipline           | <discipline>       |
      | summary              | A representative route summary for this scenario. |
      | proposedGradeOrdinal | 12                  |
      | boltCount            | <boltCount>         |
      | minRopeLengthM       | <minRopeLengthM>    |
    Then the submission <outcome>

    Examples:
      | name            | discipline           | boltCount | minRopeLengthM | outcome                          |
      | Sport Line       | SPORT_CLIMBING       | 10        |                 | succeeds                          |
      | Trad Line        | TRADITIONAL_CLIMBING |           | 50              | succeeds                          |
      | Boulder Problem  | BOULDERING            | 5         |                 | is rejected as a validation error |
