import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MapUiWorld } from '../support/world';
import { GYM_IN_RANGE_LOCATION } from '../support/fixtures';

// BL-024, Epic 5. Deliberately distinct wording from
// activity-ui.steps.ts's identically-shaped assertions rather than reusing
// their exact phrasing: Cucumber's step registry is global, and those two
// are hardcoded to the crag's own fixture location and to
// `[data-testid="log-climb-sheet"]` respectively -- neither is correct for
// a gym standing ~5.5km away from the crag (see fixtures.ts's comment on
// GYM_LOCATION for why the fixtures are separated that far).

Then(
  "the check-in request carries the climber's own coordinates",
  async function (this: MapUiWorld) {
    const call = this.callsTo('/check-ins').at(-1);
    assert.ok(call, 'no request reached "/check-ins"');
    assert.ok(call.json, 'the request carried no JSON body');
    assert.equal(
      typeof call.json.latitude,
      'number',
      `expected a latitude, got ${JSON.stringify(call.json)}`,
    );
    assert.equal(typeof call.json.longitude, 'number');
    // Within a few metres of where Playwright says the browser is, standing
    // at the gym (not the crag -- see GYM_IN_RANGE_LOCATION).
    assert.ok(
      Math.abs(
        (call.json.latitude as number) - GYM_IN_RANGE_LOCATION.latitude,
      ) < 0.001,
    );
  },
);

// AR-39, asserted as an absence, the same way activity-ui.steps.ts's
// "no free-text notes field" step proves it for the log sheet: gym_checkins
// has no column a notes/tier field would populate, so there is nothing here
// to type into.
Then(
  'the check-in sheet has no free-text notes field',
  async function (this: MapUiWorld) {
    const sheet = this.page.locator('[data-testid="check-in-sheet"]');
    await sheet.waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(
      await sheet.locator('textarea').count(),
      0,
      'the check-in sheet must not collect notes -- gym_checkins has no column for them',
    );
  },
);
