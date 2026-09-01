import { Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MapUiWorld } from '../support/world';
import {
  IN_RANGE_LOCATION,
  MULTI_ROUTE_CRAG_DETAIL,
} from '../support/fixtures';

When(
  'the climber chooses the route {string}',
  async function (this: MapUiWorld, name: string) {
    await this.page
      .locator('[data-testid="route-choice-option"]')
      .filter({ hasText: name })
      .first()
      .locator('input')
      .check();
  },
);

// AR-30, asserted as an absence. The mockup shows a notes field; the schema
// has nowhere to put one and Sprint 3 declined to add one. Without this, the
// next person comparing screen to design files it as a bug.
Then(
  'the open sheet has no free-text notes field',
  async function (this: MapUiWorld) {
    const sheet = this.page.locator('[data-testid="log-climb-sheet"]');
    await sheet.waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(
      await sheet.locator('textarea').count(),
      0,
      'the log sheet must not collect notes -- climb_logs has no column for them',
    );
  },
);

// AR-16: on the real path the client's own coordinates are what the server
// checks against, so a request that forgot to carry them would be rejected as
// "no location supplied" rather than as "too far" -- a failure whose message
// would send someone hunting for a GPS problem they do not have.
Then(
  "the body sent to {string} carries the climber's coordinates",
  async function (this: MapUiWorld, fragment: string) {
    const call = this.callsTo(fragment).at(-1);
    assert.ok(call, `no request reached "${fragment}"`);
    assert.ok(call.json, 'the request carried no JSON body');
    assert.equal(
      typeof call.json.latitude,
      'number',
      `expected a latitude, got ${JSON.stringify(call.json)}`,
    );
    assert.equal(typeof call.json.longitude, 'number');
    // Within a few metres of where Playwright says the browser is.
    assert.ok(
      Math.abs((call.json.latitude as number) - IN_RANGE_LOCATION.latitude) < 0.001,
    );
  },
);

// The panel is per-crag but every one of these endpoints is per-route, so
// "did the right route get it?" is a question only the URL can answer.
Then(
  'the request targeted the route {string}',
  async function (this: MapUiWorld, name: string) {
    const route = MULTI_ROUTE_CRAG_DETAIL.routes.find(
      (entry) => entry.name === name,
    );
    assert.ok(route, `no fixture route named "${name}"`);
    const call = this.calls.at(-1);
    assert.ok(call, 'no request was made at all');
    assert.ok(
      call.url.includes(route.id),
      `expected the request to target ${route.id}, got ${call.url}`,
    );
  },
);
