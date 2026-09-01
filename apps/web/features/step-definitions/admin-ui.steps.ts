import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MapUiWorld } from '../support/world';
import { UNVERIFIED_GYM_DETAIL, UNVERIFIED_GYM_ID } from '../support/fixtures';

// The gym id is a fixture constant rather than something typed into the
// feature file: a uuid in Gherkin is noise a reader has to skip past, and it
// would have to be kept in step with fixtures.ts by hand.
Given(
  'an admin has opened the direct-verify page for the waiting gym',
  async function (this: MapUiWorld) {
    await this.openDesktop(`/admin/gyms/${UNVERIFIED_GYM_ID}/verify`);
  },
);

// AR-17's "once VERIFIED, re-verification is unavailable" convention, which
// the server enforces with a 409. The form checks first and says so, because
// a refusal earned by clicking a button that should not have been there is a
// worse experience than not offering it.
Given('the waiting gym has already been verified', function (this: MapUiWorld) {
  this.overrides.set('map-gym-unverified', {
    status: 200,
    body: {
      ...UNVERIFIED_GYM_DETAIL,
      status: 'VERIFIED',
      disciplinesOffered: ['BOULDERING'],
    },
  });
});

// AR-31: the queue is GET /api/map/pins filtered client-side, so "only the
// ones still waiting" is a claim about this component's filter rather than
// about a server query. The pin fixture deliberately contains a VERIFIED gym
// as well, so a filter that did nothing would fail here.
Then(
  'the queue lists exactly {int} gym waiting',
  async function (this: MapUiWorld, expected: number) {
    const rows = this.page.locator('[data-testid="admin-gym-row"]');
    await rows.first().waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await rows.count(), expected);
  },
);
