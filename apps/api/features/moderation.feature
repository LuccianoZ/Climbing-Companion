Feature: Media & moderation
  The profanity gateway on user-authored names (BL-026), two-stage image
  moderation with visibility gating and the Admin Flag Queue (BL-027), the
  admin Approve / Reject / Reject+Strike / Reject+Ban flow with AR-1's
  verification-photo rule (BL-028), verification voiding with its route and
  crag reversal (BL-029, never cut), and community reports re-entering the
  queue (BL-030).

  Actors act via X-Test-Mock-Auth rather than a session cookie -- every
  scenario needs an uploader, an admin, and often a third viewer
  concurrently, and AuthWorld tracks only one cookie (same convention as
  route-verification.feature, AR-16).

  # BL-026 / BL-027 / BL-028 / BL-029 / BL-030 -- TestInventory.md `moderation.feature`

  Background:
    Given a Verified Climber "uploader@example.com" is already registered with password "correct horse battery staple"
    And a Verified Climber "viewer@example.com" is already registered with password "correct horse battery staple"
    And "admin@example.com" is a registered SYSTEM_ADMIN

  Scenario: A route name containing a filtered term is rejected 400 and nothing is written
    Given "uploader@example.com" is logged in with password "correct horse battery staple"
    When "uploader@example.com" submits a route named "Shit Show Slab" at latitude 42.8864, longitude -78.8784 with these details:
      | discipline           | SPORT_CLIMBING              |
      | summary              | A clean line up the slab.   |
      | proposedGradeOrdinal | 10                          |
    Then the submission is rejected as a validation error
    And no route named "Shit Show Slab" exists

  Scenario: A clean route name passes the profanity gateway unmodified
    Given "uploader@example.com" is logged in with password "correct horse battery staple"
    When "uploader@example.com" submits a route named "Solar Power" at latitude 42.8864, longitude -78.8784 with these details:
      | discipline           | SPORT_CLIMBING             |
      | summary              | A sunny classic.           |
      | proposedGradeOrdinal | 14                         |
    Then the submission succeeds

  Scenario: A fresh upload lands PENDING and is visible only to its owner and admins
    Given "uploader@example.com" has uploaded a "REVIEW_PHOTO" photo
    Then the uploaded photo is PENDING
    When "uploader@example.com" streams the uploaded photo
    Then the photo stream succeeds
    When "admin@example.com" streams the uploaded photo
    Then the photo stream succeeds
    When "viewer@example.com" streams the uploaded photo
    Then the photo stream is not found
    When an anonymous visitor streams the uploaded photo
    Then the photo stream is not found

  Scenario: Admin Approve publishes the asset to everyone
    Given "uploader@example.com" has uploaded a "REVIEW_PHOTO" photo
    When "admin@example.com" approves the uploaded photo
    Then the uploaded photo is APPROVED
    When an anonymous visitor streams the uploaded photo
    Then the photo stream succeeds

  Scenario: Admin Reject of an ordinary photo purges visibility with no strike
    Given "uploader@example.com" has uploaded a "REVIEW_PHOTO" photo
    When "admin@example.com" rejects the uploaded photo with preset "LOW_IMAGE_QUALITY"
    Then the uploaded photo is REJECTED
    And "uploader@example.com" has 0 strikes
    And "uploader@example.com" is not banned
    And "uploader@example.com" has an IMAGE_REJECTED notification
    And "uploader@example.com" received an IMAGE_REJECTED email

  Scenario: Rejecting a photo without a reason once a strike is attached is refused before commit
    Given "uploader@example.com" has uploaded a "REVIEW_PHOTO" photo
    When "admin@example.com" rejects the uploaded photo and issues a strike with no reason
    Then the moderation decision is rejected as a validation error
    And the uploaded photo is PENDING
    And "uploader@example.com" has 0 strikes

  Scenario: Rejecting a route-verification photo always strikes the uploader and voids the verification
    Given "Higher Ground" is the founding route of a crag verified by 4 photo verifications
    When "admin@example.com" rejects a verification photo for "Higher Ground"
    Then the uploaded photo is REJECTED
    And the verifier who uploaded it has 1 strike
    And the verifier who uploaded it received a STRIKE_ISSUED email
    And "Higher Ground" reverts to UNVERIFIED
    And the crag for "Higher Ground" reverts to UNVERIFIED

  Scenario: Admin Reject + Ban Outright bans immediately regardless of strike count
    Given "uploader@example.com" has uploaded a "REVIEW_PHOTO" photo
    When "admin@example.com" rejects the uploaded photo with preset "INAPPROPRIATE_EXPLICIT" and bans the uploader
    Then the uploaded photo is REJECTED
    And "uploader@example.com" is banned
    And "uploader@example.com" has 0 strikes
    And "uploader@example.com" has no STRIKE_ISSUED notification

  Scenario: The third cumulative strike auto-bans the uploader
    Given "uploader@example.com" already has 2 strikes
    And "uploader@example.com" has uploaded a "REVIEW_PHOTO" photo
    When "admin@example.com" rejects the uploaded photo with preset "SUSPECTED_FRAUDULENT" and issues a strike
    Then "uploader@example.com" has 3 strikes
    And "uploader@example.com" is banned
    And "uploader@example.com" received an ACCOUNT_BANNED email

  Scenario: A banned uploader is locked out of guarded endpoints
    Given "uploader@example.com" has been banned by an admin
    When "uploader@example.com" requests their notifications
    Then the request is rejected as suspended

  Scenario: A community report on a published photo flips it back to PENDING and reappears in the Flag Queue
    Given "uploader@example.com" has uploaded a "REVIEW_PHOTO" photo
    And "admin@example.com" approves the uploaded photo
    When "viewer@example.com" reports the published photo with reason "Not climbing related"
    Then the uploaded photo is PENDING
    And the Flag Queue lists the uploaded photo with 1 report

  Scenario: A reason longer than 500 characters is rejected
    Given "uploader@example.com" has uploaded a "REVIEW_PHOTO" photo
    When "admin@example.com" rejects the uploaded photo with a 501-character reason
    Then the moderation decision is rejected as a validation error
