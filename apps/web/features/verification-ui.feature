Feature: Verifying a route and verifying a gym from the map

  BL-009, BL-010, BL-011 and BL-014's screens, reached through the four
  in-range buttons Epic 4 left deliberately inert.

  The refusals are the substance here. Both verification endpoints answer 403
  for two genuinely different reasons -- you submitted this yourself, and you
  are too far away -- distinguishable only by the message text, which is why
  lib/errors.ts keys on (action, status) and matches on wording for that one
  case (AR-26). Each of those rules is already proven against the real
  database in apps/api/features/route-verification.feature; what is proven
  here is that the climber is told which one happened, in words written for a
  person.

  # BL-008 / BL-009 / BL-010 / BL-011 / BL-014 / AR-25 / AR-26

  Background:
    Given the climber is signed in
    And the climber is standing within range of "The Great Wall"

  Scenario: The photo is uploaded first and the verification references its id
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-verify"
    Then "verify-route-sheet" is on screen
    When the climber attaches a 4096 byte "image/png" photo
    Then a POST request reached "/api/media"
    And the upload was sent as multipart rather than base64
    And "image-upload-preview" is on screen
    When the climber selects "5.11b" in "verify-grade-select"
    And the climber taps "verify-route-submit"
    Then a POST request reached "/verifications"
    And the verification referenced the uploaded photo

  Scenario: An oversized photo never leaves the browser
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-verify"
    And the climber attaches a 3000000 byte "image/png" photo
    Then "image-upload-error" reads "2MB"
    And no request reached "/api/media"

  Scenario: A file that is not a photo never leaves the browser
    Given the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-verify"
    And the climber attaches a file that is not an image
    Then "image-upload-error" reads "JPEG or PNG"
    And no request reached "/api/media"

  Scenario: Verifying your own submission is refused in plain language
    Given the server refuses "route-verification" with 403 and the message "The original submitter cannot verify their own route"
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-verify"
    And the climber attaches a 4096 byte "image/png" photo
    And the climber selects "5.11b" in "verify-grade-select"
    And the climber taps "verify-route-submit"
    Then "action-error" reads "You submitted this route"
    And the message in "action-error" does not quote the server

  Scenario: The same 403 for being too far away says something different
    Given the server refuses "route-verification" with 403 and the message "Verifier must be within 300m of the route"
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-verify"
    And the climber attaches a 4096 byte "image/png" photo
    And the climber selects "5.11b" in "verify-grade-select"
    And the climber taps "verify-route-submit"
    Then "action-error" reads "too far away"

  Scenario: Verifying the same route twice is refused
    Given the server refuses "route-verification" with 409 and the message "You have already verified this route"
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-verify"
    And the climber attaches a 4096 byte "image/png" photo
    And the climber selects "5.11b" in "verify-grade-select"
    And the climber taps "verify-route-submit"
    Then "action-error" reads "already verified this route"

  Scenario: The fourth verification reports the crag cascading with the route
    Given the fourth verification lands, verifying the route
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-verify"
    And the climber attaches a 4096 byte "image/png" photo
    And the climber selects "5.11b" in "verify-grade-select"
    And the climber taps "verify-route-submit"
    Then "action-success" reads "fourth verification"
    And "crag-cascaded" is on screen

  Scenario: An already-verified route cannot be chosen for verification
    Given the crag has a second route that is already verified
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    And the climber taps "action-verify"
    Then the route "Sun Salutation" cannot be chosen for verification
    And the route "Solar Power" can be chosen for verification

  Scenario: A crag with nothing left to verify offers no verify action
    Given every route at the crag is already verified
    And the climber opens the map
    When the climber clicks the pin for "The Great Wall"
    Then "actions-unlocked" is on screen
    And "action-verify" is not on screen
    And "nothing-to-verify" is on screen

  Scenario: Verifying a gym asks for disciplines and never for a grade
    Given the climber opens the map
    When the climber clicks the pin for "Chalk Line Bouldering"
    And the climber taps "action-verify"
    Then "verify-gym-sheet" is on screen
    And "verify-grade-select" is not on screen
    When the climber attaches a 4096 byte "image/png" photo
    And the climber taps "gym-discipline-BOULDERING"
    And the climber taps "verify-gym-submit"
    Then a POST request reached "/verifications"
    And the body sent to "/verifications" has "disciplinesSubmitted" set to '["BOULDERING"]'

  Scenario: Check-in on a gym names the story that owns it
    Given the climber opens the map
    When the climber clicks the pin for "Chalk Line Bouldering"
    And the climber taps "action-check-in"
    Then "unbuilt-action-sheet" is on screen
    And "owning-story" reads "BL-024"
