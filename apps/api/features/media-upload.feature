Feature: Image upload gateway
  The binary media upload/streaming gateway every photo in the app goes
  through (Foundation §19.1) -- base64-in-JSON explicitly banned. This file
  owns all of BL-008's scenarios; future purpose-specific callers
  (BL-009/011/045) reuse this same gateway rather than getting their own.

  # BL-008 -- TestInventory.md `media-upload.feature`

  Background:
    Given a Verified Climber "alex@example.com" is already registered with password "correct horse battery staple"
    And "alex@example.com" is logged in with password "correct horse battery staple"

  Scenario: A .jpg under 5MB uploads successfully and is retrievable via the streaming endpoint with a matching ETag
    When "alex@example.com" uploads a "10KB" "image/jpeg" file for purpose "PROFILE_PHOTO"
    Then the upload succeeds
    And streaming the uploaded media back returns the same bytes with a matching ETag

  Scenario: An upload over 5MB is rejected at the gateway before touching the database
    When "alex@example.com" uploads a "6MB" "image/jpeg" file for purpose "PROFILE_PHOTO"
    Then the upload is rejected as too large
    And no media_assets row was written

  Scenario: An unsupported MIME type is rejected
    When "alex@example.com" uploads a "10KB" "text/plain" file for purpose "PROFILE_PHOTO"
    Then the upload is rejected as an unsupported media type
    And no media_assets row was written

  Scenario: The streaming endpoint never returns the image inline as base64 JSON
    When "alex@example.com" uploads a "10KB" "image/png" file for purpose "PROFILE_PHOTO"
    Then the upload succeeds
    When the uploaded media is streamed back
    Then the response Content-Type is "image/png", not JSON

  Scenario: A repeat request with a matching If-None-Match ETag returns 304
    When "alex@example.com" uploads a "10KB" "image/jpeg" file for purpose "PROFILE_PHOTO"
    Then the upload succeeds
    When the uploaded media is streamed back with If-None-Match set to its own ETag
    Then the response status is 304
