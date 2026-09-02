Feature: The admin dashboard and direct gym verification

  BL-012's screen, and the first admin-facing surface in the app. AR-28 builds
  it as the seed of Epic 7's dashboard rather than as a standalone page, so it
  is the first thing to take the second half of Foundation section 17's
  Definition of Done -- "mobile-first for climber-facing surfaces, dense
  multi-column for /admin/*". Every layout rule the climber app follows is
  deliberately broken here, which is why the shape itself is worth a scenario.

  Access is the other theme. RolesGuard answers 403 to a non-admin regardless
  (AR-17), so nothing below is the security boundary -- but a signed-in
  climber who lands on /admin should be told no, not bounced to a login form
  they would immediately pass.

  # BL-012 / AR-17 / AR-28 / AR-31

  Scenario: The dashboard is deskbound, not the phone shell
    Given the climber is signed in as an administrator
    When an admin opens "/admin"
    Then "admin-sidebar" is on screen
    And "tab-map" is not on screen
    And "admin-card-gyms" is on screen

  Scenario: A signed-in climber who is not an admin is told no, not sent to login
    Given the climber is signed in
    When an admin opens "/admin"
    Then "admin-forbidden" is on screen
    And "admin-sidebar" is not on screen

  Scenario: A signed-out visitor is sent to sign in
    Given the climber is signed out
    When an admin opens "/admin"
    Then the browser lands on "/login?next=%2Fadmin"

  Scenario: The queue lists gyms still waiting, and only those
    Given the climber is signed in as an administrator
    And the map also shows a gym waiting for verification
    When an admin opens "/admin/gyms"
    Then "admin-gym-queue" is on screen
    And the queue lists exactly 1 gym waiting
    And "admin-gym-queue" reads "Chalk Line Bouldering"

  Scenario: Verifying directly sends disciplines and never a photo
    Given the climber is signed in as an administrator
    And an admin has opened the direct-verify page for the waiting gym
    When the climber taps "admin-discipline-BOULDERING"
    And the climber taps "admin-discipline-TOP_ROPE"
    And the climber taps "admin-verify-submit"
    Then a PATCH request reached "/admin-verify"
    And the body sent to "/admin-verify" has "disciplinesOffered" set to '["BOULDERING","TOP_ROPE"]'
    And no request reached "/api/media"
    And "admin-verify-success" is on screen

  Scenario: The form will not submit with no discipline chosen
    Given the climber is signed in as an administrator
    And an admin has opened the direct-verify page for the waiting gym
    Then "admin-verify-submit" is disabled
    And no request reached "/admin-verify"

  Scenario: A gym that is already verified cannot be verified again
    Given the climber is signed in as an administrator
    And the waiting gym has already been verified
    And an admin has opened the direct-verify page for the waiting gym
    Then "admin-already-verified" is on screen
    And "admin-verify-submit" is not on screen

  Scenario: A refusal from the server is explained in plain language
    Given the climber is signed in as an administrator
    And the server refuses "admin-verify" with 403 and the message "This action requires one of the following roles: SYSTEM_ADMIN"
    And an admin has opened the direct-verify page for the waiting gym
    When the climber taps "admin-discipline-BOULDERING"
    And the climber taps "admin-verify-submit"
    Then "admin-verify-error" reads "Only a system administrator"
    And the message in "admin-verify-error" does not quote the server

  Scenario: The admin entry point is hidden from a climber who is not one
    Given the climber is signed in
    When the climber opens "/"
    Then "admin-entry" is not on screen
    And "submit-fab" is on screen

  Scenario: An admin reaches the dashboard from the header
    Given the climber is signed in as an administrator
    When the climber opens "/"
    Then "admin-entry" is on screen
