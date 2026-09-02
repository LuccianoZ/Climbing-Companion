import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MapUiWorld } from '../support/world';
import {
  GYM_IN_RANGE_LOCATION,
  IN_RANGE_LOCATION,
  MULTI_ROUTE_CRAG_DETAIL,
  OUT_OF_RANGE_LOCATION,
} from '../support/fixtures';

// Steps shared by the five Sprint 1/2 backfill features. Kept in one file
// rather than duplicated per feature because Cucumber's step registry is
// global -- two files defining the same phrase is an ambiguous-step error, not
// a shadow -- and because the phrasings below are deliberately generic
// (open a path, fill a field, read an error) where map-ui.steps.ts is
// deliberately domain-specific about pins and panels.

// --- session and server state ----------------------------------------------

Given('the climber is signed out', function (this: MapUiWorld) {
  this.session = 'ANONYMOUS';
});

Given('the climber is signed in', function (this: MapUiWorld) {
  this.session = 'CLIMBER';
});

Given('the climber is signed in as an administrator', function (this: MapUiWorld) {
  this.session = 'ADMIN';
});

// Serves the two-route crag by overriding the endpoint's payload outright,
// the same way "every route at the crag is already verified" does, rather than
// through a flag the stub consults while building its default response.
Given(
  'the crag has a second route that is already verified',
  function (this: MapUiWorld) {
    this.overrides.set('map-crag', {
      status: 200,
      body: MULTI_ROUTE_CRAG_DETAIL,
    });
  },
);

// The failure cases are the whole reason this suite stubs the API (see the
// long note in world.ts): each of these refusals is already proven against the
// real database in apps/api's own suite, and what is unproven is that this app
// turns it into the right sentence.
Given(
  'the server refuses {string} with {int} and the message {string}',
  function (this: MapUiWorld, key: string, status: number, message: string) {
    this.refuse(key, status, message);
  },
);

Given(
  'the fourth verification lands, verifying the route',
  function (this: MapUiWorld) {
    this.overrides.set('route-verification', {
      status: 201,
      body: {
        route: { id: 'route', status: 'VERIFIED' },
        routeNewlyVerified: true,
        cragNewlyVerified: true,
      },
    });
  },
);

Given(
  'the fourth verification lands, verifying the gym',
  function (this: MapUiWorld) {
    this.overrides.set('gym-verification', {
      status: 201,
      body: {
        gym: {
          id: 'gym',
          status: 'VERIFIED',
          disciplinesOffered: ['BOULDERING', 'LEAD'],
        },
        gymNewlyVerified: true,
      },
    });
  },
);

// Name-aware, because the fixtures place the crag and the waiting gym ~1.7km
// apart on purpose (see fixtures.ts) -- so "in range" is a different point
// depending on which one you are standing at, and a scenario that stood at the
// crag while acting on the gym would see the locked panel, not the actions.
const IN_RANGE_OF: Record<string, { latitude: number; longitude: number }> = {
  'The Great Wall': IN_RANGE_LOCATION,
  'Chalk Line Bouldering': GYM_IN_RANGE_LOCATION,
};

Given(
  'the climber is standing within range of {string}',
  function (this: MapUiWorld, name: string) {
    const location = IN_RANGE_OF[name];
    if (!location) {
      throw new Error(`No in-range fixture location for "${name}"`);
    }
    this.geolocation = location;
  },
);

// Epic 4's map-ui.feature counts the pins on the map and asserts there are
// exactly two, so the waiting gym is opt-in rather than part of the default
// fixture set.
Given(
  'the map also shows a gym waiting for verification',
  function (this: MapUiWorld) {
    this.includeUnverifiedGym = true;
  },
);

Given(
  'the climber is standing well outside range of {string}',
  function (this: MapUiWorld, _name: string) {
    this.geolocation = OUT_OF_RANGE_LOCATION;
  },
);

// --- navigation -------------------------------------------------------------

When('the climber opens {string}', async function (this: MapUiWorld, path: string) {
  await this.open(path);
});

Given('the climber has opened {string}', async function (this: MapUiWorld, path: string) {
  await this.open(path);
});

When('an admin opens {string}', async function (this: MapUiWorld, path: string) {
  await this.openDesktop(path);
});

Given('an admin has opened {string}', async function (this: MapUiWorld, path: string) {
  await this.openDesktop(path);
});

// --- interaction ------------------------------------------------------------

When(
  'the climber fills {string} with {string}',
  async function (this: MapUiWorld, field: string, value: string) {
    await this.page.fill(`#${field}`, value);
  },
);

When(
  'the climber types {string} into the field tagged {string}',
  async function (this: MapUiWorld, value: string, testId: string) {
    await this.page.fill(`[data-testid="${testId}"]`, value);
  },
);

When('the climber taps {string}', async function (this: MapUiWorld, testId: string) {
  await this.page.locator(`[data-testid="${testId}"]`).click();
});

When(
  'the climber selects {string} in {string}',
  async function (this: MapUiWorld, label: string, testId: string) {
    await this.page
      .locator(`[data-testid="${testId}"]`)
      .selectOption({ label });
  },
);

// A real file, written to disk and handed to the input, so the browser
// produces a genuine multipart body. Nothing here fakes the upload: the size
// and MIME type are the actual ones the component pre-checks against.
When(
  'the climber attaches a {int} byte {string} photo',
  async function (this: MapUiWorld, bytes: number, mime: string) {
    await this.page.locator('[data-testid="image-upload-input"]').setInputFiles({
      name: mime === 'image/png' ? 'proof.png' : 'proof.jpg',
      mimeType: mime,
      buffer: Buffer.alloc(bytes, 1),
    });
  },
);

When(
  'the climber attaches a file that is not an image',
  async function (this: MapUiWorld) {
    await this.page.locator('[data-testid="image-upload-input"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a photo'),
    });
  },
);

// --- assertions -------------------------------------------------------------

Then('{string} is on screen', async function (this: MapUiWorld, testId: string) {
  await this.page
    .locator(`[data-testid="${testId}"]`)
    .waitFor({ state: 'visible', timeout: 15_000 });
});

// Asserting a refusal by clicking the button and expecting nothing to happen
// cannot work when the button is disabled: Playwright waits for it to become
// enabled and then times out, which reads as a broken test rather than a
// working guard.
Then('{string} is disabled', async function (this: MapUiWorld, testId: string) {
  const button = this.page.locator(`[data-testid="${testId}"]`);
  await button.waitFor({ state: 'visible', timeout: 15_000 });
  assert.equal(await button.isDisabled(), true, `expected "${testId}" to be disabled`);
});

Then('{string} is not on screen', async function (this: MapUiWorld, testId: string) {
  // Wait for something else to settle first so this cannot pass simply by
  // running before the page rendered anything at all.
  await this.page.waitForLoadState('domcontentloaded');
  await this.page.waitForTimeout(400);
  assert.equal(
    await this.page.locator(`[data-testid="${testId}"]`).count(),
    0,
    `expected no element tagged "${testId}"`,
  );
});

Then(
  '{string} reads {string}',
  async function (this: MapUiWorld, testId: string, expected: string) {
    const locator = this.page.locator(`[data-testid="${testId}"]`);
    await locator.waitFor({ state: 'visible', timeout: 15_000 });
    const text = (await locator.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    assert.ok(
      text.includes(expected),
      `expected "${testId}" to contain "${expected}", got "${text}"`,
    );
  },
);

Then(
  'the message in {string} does not quote the server',
  async function (this: MapUiWorld, testId: string) {
    const text = (await this.page.locator(`[data-testid="${testId}"]`).textContent()) ?? '';
    // The server's own prose is written for a log and names internals a
    // climber has no model for. AR-26 exists to keep it off the screen, and
    // these are the tell-tale fragments it would arrive with.
    for (const leak of ['ForbiddenException', 'statusCode', 'ST_DWithin', 'DTO']) {
      assert.ok(
        !text.includes(leak),
        `plain-language copy leaked server wording: "${leak}"`,
      );
    }
  },
);

Then(
  'the browser lands on {string}',
  async function (this: MapUiWorld, path: string) {
    await this.page.waitForURL((url) => url.pathname + url.search === path || url.pathname === path, {
      timeout: 15_000,
    });
  },
);

// --- what the app actually sent --------------------------------------------

Then(
  'a {word} request reached {string}',
  async function (this: MapUiWorld, method: string, fragment: string) {
    await this.page.waitForTimeout(300);
    const matches = this.callsTo(fragment).filter(
      (call) => call.method === method.toUpperCase(),
    );
    assert.ok(
      matches.length > 0,
      `expected a ${method} to a URL containing "${fragment}"; saw ${this.calls
        .map((call) => `${call.method} ${call.url}`)
        .join(', ')}`,
    );
  },
);

Then(
  'no request reached {string}',
  async function (this: MapUiWorld, fragment: string) {
    await this.page.waitForTimeout(400);
    assert.equal(
      this.callsTo(fragment).length,
      0,
      `expected nothing to reach "${fragment}"`,
    );
  },
);

Then(
  'the body sent to {string} has no {string} field',
  async function (this: MapUiWorld, fragment: string, field: string) {
    const call = this.callsTo(fragment).at(-1);
    assert.ok(call, `no request reached "${fragment}"`);
    assert.ok(call.json, `request to "${fragment}" carried no JSON body`);
    assert.ok(
      !(field in call.json),
      `expected "${field}" to be omitted entirely, got ${JSON.stringify(call.json)}`,
    );
  },
);

Then(
  'the body sent to {string} has {string} set to {string}',
  async function (
    this: MapUiWorld,
    fragment: string,
    field: string,
    expected: string,
  ) {
    const call = this.callsTo(fragment).at(-1);
    assert.ok(call, `no request reached "${fragment}"`);
    assert.ok(call.json, `request to "${fragment}" carried no JSON body`);
    assert.equal(
      JSON.stringify(call.json[field]),
      expected,
      `unexpected "${field}" in ${JSON.stringify(call.json)}`,
    );
  },
);
