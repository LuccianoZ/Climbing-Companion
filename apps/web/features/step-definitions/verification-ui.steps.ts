import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MapUiWorld } from '../support/world';
import { CRAG_DETAIL, MEDIA_ASSET } from '../support/fixtures';

// BL-008's hard requirement, and the one most likely to be quietly undone by a
// future refactor: base64-in-JSON was explicitly rejected in backend review
// (Foundation section 19.1), and the difference is invisible from the outside
// -- both shapes "work" against a permissive server. Asserting the request's
// own Content-Type is the only way to hold it.
Then(
  'the upload was sent as multipart rather than base64',
  async function (this: MapUiWorld) {
    const upload = this.callsTo('/api/media').at(-1);
    assert.ok(upload, 'no upload request was made');
    assert.ok(
      upload.contentType.startsWith('multipart/form-data'),
      `expected multipart/form-data, got "${upload.contentType}"`,
    );
    assert.ok(
      !(upload.raw ?? '').includes('base64'),
      'the upload body looks base64-encoded',
    );
  },
);

// The other half of "upload first, then reference the id": the verification
// call must carry the id the upload came back with, not a file and not a
// placeholder.
Then(
  'the verification referenced the uploaded photo',
  async function (this: MapUiWorld) {
    const call = this.callsTo('/verifications').at(-1);
    assert.ok(call, 'no verification request was made');
    assert.ok(call.json, 'the verification carried no JSON body');
    assert.equal(call.json.mediaAssetId, MEDIA_ASSET.id);
  },
);

Given('every route at the crag is already verified', function (this: MapUiWorld) {
  this.overrides.set('map-crag', {
    status: 200,
    body: {
      ...CRAG_DETAIL,
      routes: CRAG_DETAIL.routes.map((route) => ({
        ...route,
        status: 'VERIFIED',
        verificationCount: 4,
      })),
    },
  });
});

// AR-25: an already-verified route is struck out of the picker rather than
// left selectable and refused on submit. The server agrees -- it answers 409
// -- so this removes a guaranteed failure rather than a capability.
async function routeOption(world: MapUiWorld, name: string) {
  const option = world.page
    .locator('[data-testid="route-choice-option"]')
    .filter({ hasText: name });
  await option.first().waitFor({ state: 'visible', timeout: 15_000 });
  return option.first();
}

Then(
  'the route {string} cannot be chosen for verification',
  async function (this: MapUiWorld, name: string) {
    const option = await routeOption(this, name);
    assert.equal(await option.getAttribute('data-disabled'), 'true');
    assert.equal(await option.locator('input').isDisabled(), true);
  },
);

Then(
  'the route {string} can be chosen for verification',
  async function (this: MapUiWorld, name: string) {
    const option = await routeOption(this, name);
    assert.equal(await option.getAttribute('data-disabled'), 'false');
    assert.equal(await option.locator('input').isDisabled(), false);
  },
);
