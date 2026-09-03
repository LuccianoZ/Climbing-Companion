Feature: Media & moderation on the frontend

  The Alerts tab's image-rejected and strike cards (BL-028, 6-screen mockup),
  the "Account Suspended" lockout screen (BL-028, 4-screen mockup), and the
  admin photo flag queue with its Approve / Reject / Reject+Strike /
  Reject+Ban panel (BL-027/028, AR-1).

  Same stub strategy as every web feature (AR-21): /api/* is fixture-driven,
  and the forms, the routing and every line of app code are real. The states
  worth asserting here are "the right card for the right notification type"
  and "the strike is locked on for a verification photo" -- both DOM facts a
  stub proves honestly.

  # BL-026 / BL-027 / BL-028 -- Epic 6

  Scenario: The Alerts tab renders a card per notification type
    Given the climber is signed in
    When the climber opens "/alerts"
    Then "alerts-list" is on screen
    And "alert-IMAGE_REJECTED" is on screen
    And "alert-STRIKE_ISSUED" is on screen
    And "alert-IMAGE_REJECTED" reads "Check your email"

  Scenario: An empty Alerts tab says so rather than showing a blank list
    Given the climber is signed in
    And there are no notifications
    When the climber opens "/alerts"
    Then "alerts-empty" is on screen

  Scenario: Mark all read clears the unread markers
    Given the climber is signed in
    When the climber opens "/alerts"
    Then 2 alerts are marked unread
    When the climber taps "alerts-mark-read"
    Then 0 alerts are marked unread

  Scenario: A signed-out visitor on the Alerts tab is sent to sign in
    Given the climber is signed out
    When the climber opens "/alerts"
    Then the browser lands on "/login?next=%2Falerts"

  Scenario: A suspended account sees the lockout notice, not a login redirect
    Given the climber is signed in but suspended
    When the climber opens "/"
    Then "account-suspended" is on screen
    And "tab-map" is not on screen

  Scenario: A suspended account is locked out of every route
    Given the climber is signed in but suspended
    When the climber opens "/alerts"
    Then "account-suspended" is on screen

  Scenario: The flag queue lists every pending photo with the verification badge where it belongs
    Given the climber is signed in as an administrator
    When an admin opens "/admin/media"
    Then "flag-queue" is on screen
    And the flag queue has 2 rows
    And the verification-photo row shows the strike-on-rejection badge
    And "flag-queue-reports" is on screen

  Scenario: Approving an ordinary photo sends decision APPROVE and no reason
    Given the climber is signed in as an administrator
    And an admin has opened "/admin/media"
    When the climber taps the review button for the review photo
    And the climber taps "moderation-action-APPROVE"
    And the climber taps "moderation-submit"
    Then a POST request reached "/moderate"
    And the body sent to "/moderate" has "decision" set to '"APPROVE"'

  Scenario: A verification photo offers no plain Reject -- only the strike variant (AR-1)
    Given the climber is signed in as an administrator
    And an admin has opened "/admin/media"
    When the climber taps the review button for the verification photo
    Then "moderation-action-REJECT_STRIKE" is on screen
    And "moderation-action-REJECT" is not on screen

  Scenario: Reject + Strike will not submit without a reason
    Given the climber is signed in as an administrator
    And an admin has opened "/admin/media"
    When the climber taps the review button for the review photo
    And the climber taps "moderation-action-REJECT_STRIKE"
    Then "moderation-submit" is disabled
    And no request reached "/moderate"

  Scenario: Rejecting with a preset sends the reason
    Given the climber is signed in as an administrator
    And an admin has opened "/admin/media"
    When the climber taps the review button for the review photo
    And the climber taps "moderation-action-REJECT"
    And the climber selects "Off-topic content" in "moderation-reason-preset"
    And the climber taps "moderation-submit"
    Then the body sent to "/moderate" has "decision" set to '"REJECT"'
    And the body sent to "/moderate" has "reasonPreset" set to '"OFF_TOPIC"'
