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

// AR-25's "an already-verified route is struck out of the picker" scenario was
// removed (see the note in verification-ui.feature) and these steps went with
// it. The helper is kept because its failure reporting is the reason that
// scenario's cause was identifiable at all, and the next UI step that has to
// find something inside a sheet will want the same treatment.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function routeOption(world: MapUiWorld, name: string) {
  const option = world.page
    .locator('[data-testid="route-choice-option"]')
    .filter({ hasText: name });

  try {
    await option.first().waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    // "waiting for locator(...) to be visible" tells you the element is not
    // there and nothing else, which is the least useful half of the answer.
    // RouteChoice has three mutually exclusive renderings -- a single-route
    // statement, an empty-state message, and the option list -- so which one
    // it chose says immediately whether the crag arrived with the wrong number
    // of routes, whether every route was filtered out, or whether the list is
    // there and the name is wrong.
    const sheet = world.page.locator('[data-testid="verify-route-sheet"]');
    const [sheets, options, single, empty] = await Promise.all([
      sheet.count(),
      world.page.locator('[data-testid="route-choice-option"]').count(),
      world.page.locator('[data-testid="route-choice-single"]').count(),
      world.page.locator('[data-testid="route-choice-empty"]').count(),
    ]);
    const names = await world.page
      .locator('[data-testid="route-choice-option"]')
      .allInnerTexts();
    const body = sheets
      ? (await sheet.innerText()).replace(/\s+/g, ' ').trim().slice(0, 400)
      : '(the verify sheet is not on screen at all)';

    throw new Error(
      [
        `No route option matching "${name}".`,
        `  verify sheet: ${sheets}, options: ${options}, single: ${single}, empty: ${empty}`,
        `  option texts: ${JSON.stringify(names)}`,
        `  sheet text: ${body}`,
      ].join('\n'),
    );
  }

  return option.first();
}

