Feature: Gym submission and verification
  A Verified Climber submits a gym as a standalone pin -- no crag
  relationship, no founding-route concept (Epic 2, Foundation §4). This
  file also owns BL-011 (gym verification) and BL-012 (admin direct
  verification) scenarios; only BL-007's own scenario exists so far.

  # BL-007 -- TestInventory.md `gym-submission-and-verification.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And "alex@example.com" is logged in with password "correct horse battery staple"

  Scenario: Submitting a gym creates a standalone gyms row with no crag relationship
    When "alex@example.com" submits a gym named "Vertical Edge Climbing Gym" at latitude 42.8901, longitude -78.8712
    Then the gym submission succeeds
    And a standalone gym "Vertical Edge Climbing Gym" exists with no crag relationship, status UNVERIFIED, and no disciplines offered yet
