import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { Locator } from 'playwright';
import { MapUiWorld } from '../support/world';
import {
  CRAG_LOCATION,
  IN_RANGE_LOCATION,
  OUT_OF_RANGE_LOCATION,
  SEARCH_TARGET,
} from '../support/fixtures';

const BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3000';

// The translucent-grey value BL-020 asks for, as globals.css defines it
// (--color-dormant: #9b968f). Asserted as a resolved rgb() string so the
// test fails if the token is quietly repointed at something that is no
// longer grey.
const DORMANT_RGB = 'rgb(155, 150, 143)';

function pin(world: MapUiWorld, name: string): Locator {
  return world.page.locator(`[data-testid="map-pin"][data-pin-name="${name}"]`);
}

function routeCard(world: MapUiWorld, name: string): Locator {
  return world.page.locator(`[data-testid="route-card"][data-route-name="${name}"]`);
}

async function waitForPins(world: MapUiWorld): Promise<void> {
  await world.page.waitForSelector('[data-testid="map-pin"]', { timeout: 20_000 });
}

// Reads the map's live centre and zoom from the data attributes
// MapStatePublisher writes onto the Leaflet container (see MapCanvas.tsx) --
// the map's actual position, not an inference from which tiles loaded, and
// no reliance on a private Leaflet field.
async function mapCentre(
  world: MapUiWorld,
): Promise<{ lat: number; lng: number }> {
  const raw = await world.page
    .locator('.leaflet-container')
    .getAttribute('data-map-centre');
  assert.ok(raw, 'expected the map to publish its centre');
  const [lat, lng] = raw.split(',').map(Number);
  return { lat, lng };
}

async function mapZoom(world: MapUiWorld): Promise<number> {
  const raw = await world.page
    .locator('.leaflet-container')
    .getAttribute('data-map-zoom');
  assert.ok(raw, 'expected the map to publish its zoom level');
  return Number(raw);
}

// --- opening the map -------------------------------------------------------

Given('the climber opens the map', async function (this: MapUiWorld) {
  await this.open('/');
  await waitForPins(this);
});

Given(
  'the crag {string} has been verified by the community',
  function (this: MapUiWorld, _name: string) {
    this.cragStatus = 'VERIFIED';
  },
);

Given(
  'the climber is standing {int} meters from {string}',
  function (this: MapUiWorld, meters: number, _name: string) {
    // The two fixtures straddle the 300m presence radius by 50m either way.
    this.geolocation = meters <= 300 ? IN_RANGE_LOCATION : OUT_OF_RANGE_LOCATION;
  },
);

// --- BL-019: the map itself ------------------------------------------------

Then('a Leaflet map is rendered', async function (this: MapUiWorld) {
  await this.page.waitForSelector('.leaflet-container', { timeout: 20_000 });
  assert.equal(await this.page.locator('.leaflet-container').count(), 1);
});

Then('its tiles are served by OpenStreetMap', async function (this: MapUiWorld) {
  const tile = this.page.locator('.leaflet-tile').first();
  await tile.waitFor({ timeout: 20_000 });
  const src = (await tile.getAttribute('src')) ?? '';
  assert.ok(
    src.includes('tile.openstreetmap.org'),
    `expected an OSM tile URL, got "${src}"`,
  );
  // The attribution is a licence obligation, not decoration.
  await this.page
    .locator('.leaflet-control-attribution', { hasText: 'OpenStreetMap' })
    .waitFor({ timeout: 10_000 });
});

Then('the map can be panned and zoomed', async function (this: MapUiWorld) {
  const before = await mapCentre(this);
  const beforeZoom = await mapZoom(this);

  // A real drag over the map surface, not a programmatic setView -- panning
  // being *enabled* is the criterion, and a synthetic call would pass even
  // with every interaction handler disabled.
  const box = await this.page.locator('.leaflet-container').boundingBox();
  assert.ok(box, 'expected the map to have a bounding box');
  await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await this.page.mouse.down();
  await this.page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, {
    steps: 12,
  });
  await this.page.mouse.up();
  await this.page.waitForTimeout(400);

  const afterPan = await mapCentre(this);
  assert.notDeepEqual(
    { lat: afterPan.lat.toFixed(4), lng: afterPan.lng.toFixed(4) },
    { lat: before.lat.toFixed(4), lng: before.lng.toFixed(4) },
    'expected dragging the map to change its centre',
  );

  await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await this.page.mouse.wheel(0, -400);
  await this.page.waitForTimeout(600);

  const afterZoom = await mapZoom(this);
  assert.ok(
    afterZoom > beforeZoom,
    `expected scroll-wheel zoom to increase the zoom level (${beforeZoom} -> ${afterZoom})`,
  );
});

// BL-019's second acceptance criterion. Leaflet reads `window` at import
// time, so if it ever leaked out of the dynamic ssr:false boundary the
// server response would either carry map markup or fail outright.
When('the map page is fetched as raw server HTML', async function (this: MapUiWorld) {
  const response = await fetch(BASE_URL);
  assert.equal(response.status, 200, 'expected the map page to render on the server');
  this.serverHtml = await response.text();
});

Then('the server HTML contains no Leaflet markup', function (this: MapUiWorld) {
  assert.ok(this.serverHtml, 'expected a prior "fetched as raw server HTML" step');
  assert.ok(
    !this.serverHtml.includes('leaflet-container'),
    'Leaflet rendered on the server -- the ssr:false dynamic import has been bypassed',
  );
});

Then(
  'the page still hydrates into a working map in the browser',
  async function (this: MapUiWorld) {
    await this.open('/');
    await this.page.waitForSelector('.leaflet-container', { timeout: 20_000 });
  },
);

// --- BL-020: pin rendering --------------------------------------------------

Then(
  'a pin for {string} is rendered as a {string}',
  async function (this: MapUiWorld, name: string, kind: string) {
    const marker = pin(this, name);
    await marker.waitFor({ timeout: 20_000 });
    assert.equal(await marker.getAttribute('data-pin-kind'), kind);
  },
);

Then('the two pins do not share a silhouette', async function (this: MapUiWorld) {
  const radii = await this.page
    .locator('[data-testid="map-pin"] [data-testid="pin-body"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).borderRadius),
    );
  assert.equal(radii.length, 2, 'expected exactly the two fixture pins');
  assert.notEqual(
    radii[0],
    radii[1],
    'crag and gym pins must differ by shape, not colour alone -- colour-only ' +
      'distinction collapses for a colour-blind climber and collides with ' +
      "BL-020's translucent-grey treatment",
  );
});

Then('the pin for {string} is translucent grey', async function (this: MapUiWorld, name: string) {
  const body = pin(this, name).locator('[data-testid="pin-body"]');
  await body.waitFor({ timeout: 10_000 });

  const { opacity, background } = await body.evaluate((node) => ({
    opacity: getComputedStyle(node).opacity,
    background: getComputedStyle(node).backgroundColor,
  }));

  assert.ok(
    Number(opacity) < 1,
    `expected an UNVERIFIED pin to be translucent, got opacity ${opacity}`,
  );
  assert.equal(background, DORMANT_RGB, 'expected the dormant grey fill');
});

Then(
  'the pin for {string} carries an {string} badge',
  async function (this: MapUiWorld, name: string, text: string) {
    const badge = pin(this, name).locator('[data-testid="pin-unverified-badge"]');
    await badge.waitFor({ timeout: 10_000 });
    assert.equal((await badge.textContent())?.trim(), text);
  },
);

Then('the pin for {string} is fully opaque', async function (this: MapUiWorld, name: string) {
  const body = pin(this, name).locator('[data-testid="pin-body"]');
  await body.waitFor({ timeout: 10_000 });
  const opacity = await body.evaluate((node) => getComputedStyle(node).opacity);
  assert.equal(Number(opacity), 1, `expected a VERIFIED pin to be opaque, got ${opacity}`);
});

Then(
  'the pin for {string} carries no unverified badge',
  async function (this: MapUiWorld, name: string) {
    assert.equal(
      await pin(this, name).locator('[data-testid="pin-unverified-badge"]').count(),
      0,
    );
  },
);

// --- BL-021: the detail panel -----------------------------------------------

When('the climber clicks the pin for {string}', async function (this: MapUiWorld, name: string) {
  await pin(this, name).click();
  await this.page.waitForSelector('[data-testid="detail-sheet"]', { timeout: 15_000 });
});

Then('a detail panel for a {string} opens', async function (this: MapUiWorld, kind: string) {
  const sheet = this.page.locator('[data-testid="detail-sheet"]');
  await sheet.waitFor({ timeout: 15_000 });
  // The panel opens in a loading state first; wait for the payload to land
  // before reading the discriminator.
  await this.page.waitForFunction(
    (expected) =>
      document
        .querySelector('[data-testid="detail-sheet"]')
        ?.getAttribute('data-detail-kind') === expected,
    kind,
    { timeout: 15_000 },
  );
});

Then('the detail panel shows the route {string}', async function (this: MapUiWorld, name: string) {
  await routeCard(this, name).waitFor({ timeout: 15_000 });
});

Then(
  'the route {string} shows a consensus grade of {string}',
  async function (this: MapUiWorld, name: string, grade: string) {
    const badge = routeCard(this, name).locator('[data-testid="route-grade"]');
    await badge.waitFor({ timeout: 15_000 });
    assert.equal(await badge.getAttribute('data-grade-source'), 'CONSENSUS');
    assert.ok(
      (await badge.textContent())?.includes(grade),
      `expected the grade badge to read "${grade}", got "${await badge.textContent()}"`,
    );
  },
);

Then('the route {string} shows its summary', async function (this: MapUiWorld, name: string) {
  await routeCard(this, name)
    .getByText('Sustained face climbing', { exact: false })
    .waitFor({ timeout: 10_000 });
});

Then(
  'the route {string} shows {int} of {int} verifications',
  async function (this: MapUiWorld, name: string, count: number, required: number) {
    const progress = routeCard(this, name).locator('[data-testid="verification-count"]');
    await progress.waitFor({ timeout: 10_000 });
    assert.equal(
      (await progress.textContent())?.trim(),
      `${count} of ${required} approved`,
    );
  },
);

Then('the detail panel shows a vote distribution', async function (this: MapUiWorld) {
  const rows = this.page.locator('[data-testid="vote-distribution-row"]');
  await rows.first().waitFor({ timeout: 10_000 });
  assert.equal(await rows.count(), 2, 'expected one row per voted-on grade');
});

Then(
  'the detail panel lists the disciplines {string} and {string}',
  async function (this: MapUiWorld, first: string, second: string) {
    const chips = this.page.locator('[data-testid="gym-discipline"]');
    await chips.first().waitFor({ timeout: 10_000 });
    const labels = (await chips.allTextContents()).map((t) => t.trim());
    assert.deepEqual(labels.sort(), [first, second].sort());
  },
);

// Foundation §4: a gym has no child routes, so the panel must not render an
// empty route section for one.
Then('the detail panel shows no route list', async function (this: MapUiWorld) {
  assert.equal(await this.page.locator('[data-testid="crag-routes"]').count(), 0);
  assert.equal(await this.page.locator('[data-testid="route-card"]').count(), 0);
});

Then('the in-range action buttons are visible', async function (this: MapUiWorld) {
  await this.page
    .locator('[data-testid="actions-unlocked"]')
    .waitFor({ timeout: 10_000 });
});

// Three, not four. Check-in writes gym_checkins, which has a gym_id and no
// crag equivalent anywhere in the schema, so it is absent from a crag panel --
// see AR-36 and components/actions/UnbuiltActionSheet.tsx. The gym panel's
// check-in button has its own scenario in verification-ui.feature.
Then(
  'the climber can verify, vote and log a climb',
  async function (this: MapUiWorld) {
    for (const action of ['verify', 'vote', 'log']) {
      await this.page
        .locator(`[data-testid="action-${action}"]`)
        .waitFor({ state: 'visible', timeout: 10_000 });
    }
  },
);

Then('the in-range action buttons are not visible', async function (this: MapUiWorld) {
  await this.page.locator('[data-testid="actions-locked"]').waitFor({ timeout: 10_000 });
  assert.equal(await this.page.locator('[data-testid="actions-unlocked"]').count(), 0);
  for (const action of ['verify', 'vote', 'log', 'check-in']) {
    assert.equal(
      await this.page.locator(`[data-testid="action-${action}"]`).count(),
      0,
      `expected no "${action}" button beyond 300m`,
    );
  }
});

Then('a locked-action explanation is shown instead', async function (this: MapUiWorld) {
  const locked = this.page.locator('[data-testid="actions-locked"]');
  await locked.waitFor({ timeout: 10_000 });
  assert.ok((await locked.textContent())?.includes('300 meters'));
});

// --- AR-20: the pulled-forward grade scale toggle ---------------------------

When('the climber switches the grade scale to French', async function (this: MapUiWorld) {
  await this.page.locator('[data-testid="grade-scale-french"]').click();
});

// BL-046 is what will persist this preference. Until it lands, toggling must
// stay entirely client-side -- a request here would mean a half-built
// version of that story shipped by accident.
Then('no request was made to save a grade preference', function (this: MapUiWorld) {
  const writes = this.requestedUrls.filter(
    (url) => url.includes('/api/') && url.includes('grade-display'),
  );
  assert.deepEqual(writes, []);
});

// --- BL-022: search and fly-to ----------------------------------------------

When('the climber searches for {string}', async function (this: MapUiWorld, term: string) {
  this.centreBeforeSearch = await mapCentre(this);
  await this.page.locator('[data-testid="map-search-input"]').fill(term);
  await this.page.waitForSelector('[data-testid="search-result"]', { timeout: 15_000 });
});

Then('results are shown', async function (this: MapUiWorld) {
  const count = await this.page.locator('[data-testid="search-result"]').count();
  assert.ok(count > 0, 'expected at least one search result');
});

When('the climber picks the result {string}', async function (this: MapUiWorld, name: string) {
  await this.page
    .locator(`[data-testid="search-result"][data-result-name="${name}"]`)
    .click();
});

Then('the map centre moves to the match', async function (this: MapUiWorld) {
  // flyTo animates; poll for arrival rather than sleeping a fixed guess.
  await this.page.waitForFunction(
    (target: { lat: number; lng: number }) => {
      const raw = document
        .querySelector('.leaflet-container')
        ?.getAttribute('data-map-centre');
      if (!raw) {
        return false;
      }
      const [lat, lng] = raw.split(',').map(Number);
      return (
        Math.abs(lat - target.lat) < 0.01 && Math.abs(lng - target.lng) < 0.01
      );
    },
    { lat: SEARCH_TARGET.latitude, lng: SEARCH_TARGET.longitude },
    { timeout: 15_000 },
  );

  assert.ok(
    this.centreBeforeSearch,
    'expected a recorded centre from before the search',
  );
  // Sanity check on the assertion itself: the map must have started
  // somewhere else, or "it moved there" proves nothing.
  assert.ok(
    Math.abs(this.centreBeforeSearch.lat - CRAG_LOCATION.latitude) < 1,
    'expected the map to start near the fixture crag, not at the search target',
  );
});

// The whole point of BL-022's second acceptance criterion. Anything leaving
// for a geocoder -- Nominatim, Mapbox, Google -- would show up here.
Then(
  'every request the page made went to our own app or its tile provider',
  function (this: MapUiWorld) {
    const foreign = this.requestedUrls.filter((url) => {
      const { hostname } = new URL(url);
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return false;
      }
      // OSM raster tiles are BL-019's own requirement, not geocoding.
      return !hostname.endsWith('tile.openstreetmap.org');
    });

    assert.deepEqual(
      foreign,
      [],
      `search must query our own database only, but the page called: ${foreign.join(', ')}`,
    );
  },
);
