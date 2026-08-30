import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

// Epic 4 (BL-019-022). Every step here drives the real HTTP surface
// through supertest rather than reaching MapService in-process the way
// BL-006's and BL-013's steps reach their services -- Epic 4 is precisely
// the epic that introduces an HTTP read API, so exercising it over HTTP is
// the point, not an affectation (see Architecture.md AR-19).

interface MapPinPayload {
  id: string;
  kind: 'CRAG' | 'GYM';
  name: string;
  latitude: number;
  longitude: number;
  status: string;
}

interface DetailRoutePayload {
  id: string;
  name: string;
  gearRequirements: string[];
  summary: string;
  boltCount: number | null;
  minRopeLengthM: number | null;
  grade: { source: string; gradeOrdinal: number; totalVotes: number };
  verificationCount: number;
  verificationsRequired: number;
}

interface DetailPayload {
  kind: 'CRAG' | 'GYM';
  name: string;
  routes?: DetailRoutePayload[];
  disciplinesOffered?: string[];
}

interface SearchResultPayload {
  id: string;
  kind: 'ROUTE' | 'CRAG' | 'GYM';
  name: string;
  latitude: number;
  longitude: number;
  cragId: string | null;
}

function pins(world: AuthWorld): MapPinPayload[] {
  assert.equal(
    world.response.status,
    200,
    `expected the pin request to succeed: ${JSON.stringify(world.response.body)}`,
  );
  return world.response.body as MapPinPayload[];
}

function detail(world: AuthWorld): DetailPayload {
  assert.equal(
    world.response.status,
    200,
    `expected the detail request to succeed: ${JSON.stringify(world.response.body)}`,
  );
  return world.response.body as DetailPayload;
}

function searchResults(world: AuthWorld): SearchResultPayload[] {
  assert.equal(
    world.response.status,
    200,
    `expected the search to succeed: ${JSON.stringify(world.response.body)}`,
  );
  return world.response.body as SearchResultPayload[];
}

function findRoute(world: AuthWorld, routeName: string): DetailRoutePayload {
  const panel = detail(world);
  const route = panel.routes?.find((r) => r.name === routeName);
  assert.ok(
    route,
    `expected the detail panel to list a route named "${routeName}"`,
  );
  return route;
}

async function idOf(
  world: AuthWorld,
  table: 'crags' | 'gyms',
  name: string,
): Promise<string> {
  const dataSource = world.app.get(DataSource);
  const rows: Array<{ id: string }> = await dataSource.query(
    `SELECT id FROM "${table}" WHERE name = $1`,
    [name],
  );
  assert.ok(rows[0]?.id, `expected a seeded ${table} row named "${name}"`);
  return rows[0].id;
}

// --- fixture steps -------------------------------------------------------

Given(
  'the gym {string} is VERIFIED',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE gyms SET status = 'VERIFIED', verified_at = now() WHERE name = $1`,
      [gymName],
    );
  },
);

Given(
  'the gym {string} is ARCHIVED',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE gyms SET status = 'ARCHIVED', archived_at = now() WHERE name = $1`,
      [gymName],
    );
  },
);

Given(
  'the crag {string} is ARCHIVED',
  async function (this: AuthWorld, cragName: string) {
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE crags SET status = 'ARCHIVED', archived_at = now() WHERE name = $1`,
      [cragName],
    );
  },
);

Given(
  'the gym {string} offers disciplines {string}',
  async function (this: AuthWorld, gymName: string, csv: string) {
    const dataSource = this.app.get(DataSource);
    const disciplines = csv.split(',').map((d) => d.trim());
    await dataSource.query(
      `UPDATE gyms SET disciplines_offered = $2::gym_discipline[] WHERE name = $1`,
      [gymName, disciplines],
    );
  },
);

// --- BL-019 / BL-020: the pin query ---------------------------------------

When('the map pins are requested', async function (this: AuthWorld) {
  this.response = await this.http
    .get('/api/map/pins')
    .set('Cookie', this.sessionCookie);
});

// Foundation §9: the map is the app's public front door. Sending no cookie
// at all is the whole assertion -- MapController carries no guard, and this
// step is what would catch someone adding one later.
When(
  'an unauthenticated Visitor requests the map pins',
  async function (this: AuthWorld) {
    this.response = await this.http.get('/api/map/pins');
  },
);

Then(
  'the map pins include a {string} named {string}',
  function (this: AuthWorld, kind: string, name: string) {
    const found = pins(this).some((p) => p.kind === kind && p.name === name);
    assert.ok(
      found,
      `expected a ${kind} pin named "${name}" among ${JSON.stringify(pins(this))}`,
    );
  },
);

Then(
  'the map pins do not include anything named {string}',
  function (this: AuthWorld, name: string) {
    const found = pins(this).some((p) => p.name === name);
    assert.equal(found, false, `expected no pin named "${name}"`);
  },
);

Then(
  'the map pin named {string} has status {string}',
  function (this: AuthWorld, name: string, status: string) {
    const pin = pins(this).find((p) => p.name === name);
    assert.ok(pin, `expected a pin named "${name}"`);
    assert.equal(pin.status, status);
  },
);

Then(
  'the map pin named {string} is at latitude {float}, longitude {float}',
  function (
    this: AuthWorld,
    name: string,
    latitude: number,
    longitude: number,
  ) {
    const pin = pins(this).find((p) => p.name === name);
    assert.ok(pin, `expected a pin named "${name}"`);
    // Geography round-trips through float8; compare with a tolerance far
    // tighter than any distance that matters (~1cm) rather than exactly.
    assert.ok(
      Math.abs(pin.latitude - latitude) < 1e-6,
      `latitude was ${pin.latitude}`,
    );
    assert.ok(
      Math.abs(pin.longitude - longitude) < 1e-6,
      `longitude was ${pin.longitude}`,
    );
  },
);

// --- BL-021: the detail panel ---------------------------------------------

When(
  'the detail panel for crag {string} is requested',
  async function (this: AuthWorld, cragName: string) {
    const cragId = await idOf(this, 'crags', cragName);
    this.response = await this.http.get(`/api/map/crags/${cragId}`);
  },
);

When(
  'the detail panel for gym {string} is requested',
  async function (this: AuthWorld, gymName: string) {
    const gymId = await idOf(this, 'gyms', gymName);
    this.response = await this.http.get(`/api/map/gyms/${gymId}`);
  },
);

Then(
  'the detail panel is for a {string}',
  function (this: AuthWorld, kind: string) {
    assert.equal(detail(this).kind, kind);
  },
);

Then(
  'the detail panel lists {int} route',
  function (this: AuthWorld, count: number) {
    assert.equal(detail(this).routes?.length ?? 0, count);
  },
);

Then(
  'the detail panel route {string} shows a {string} grade of {int}',
  function (
    this: AuthWorld,
    routeName: string,
    source: string,
    ordinal: number,
  ) {
    const route = findRoute(this, routeName);
    assert.equal(route.grade.source, source);
    assert.equal(route.grade.gradeOrdinal, ordinal);
  },
);

Then(
  'the detail panel route {string} shows {int} of {int} verifications',
  function (
    this: AuthWorld,
    routeName: string,
    count: number,
    required: number,
  ) {
    const route = findRoute(this, routeName);
    assert.equal(route.verificationCount, count);
    assert.equal(route.verificationsRequired, required);
  },
);

Then(
  'the detail panel route {string} carries gear requirements {string}',
  function (this: AuthWorld, routeName: string, csv: string) {
    const route = findRoute(this, routeName);
    assert.deepEqual(
      route.gearRequirements,
      csv.split(',').map((g) => g.trim()),
    );
  },
);

Then(
  'the detail panel route {string} carries the summary and rope details',
  function (this: AuthWorld, routeName: string) {
    const route = findRoute(this, routeName);
    assert.equal(route.summary, 'Sustained face climbing on good edges.');
    assert.equal(route.boltCount, 12);
    assert.equal(route.minRopeLengthM, 60);
  },
);

Then(
  'the detail panel offers disciplines {string}',
  function (this: AuthWorld, csv: string) {
    assert.deepEqual(
      detail(this).disciplinesOffered,
      csv.split(',').map((d) => d.trim()),
    );
  },
);

// Foundation §4: a gym is a standalone pin with no child routes -- the key
// must be absent, not an empty array, so the frontend branches on kind
// rather than on emptiness.
Then('the detail panel has no route list', function (this: AuthWorld) {
  assert.equal(detail(this).routes, undefined);
});

Then(
  'the detail panel request is rejected as not found',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 404, JSON.stringify(this.response.body));
  },
);

// --- BL-022: DB-only name search -------------------------------------------

When(
  'the map is searched for {string}',
  async function (this: AuthWorld, term: string) {
    this.response = await this.http.get('/api/map/search').query({ q: term });
  },
);

Then(
  'the search results include a {string} named {string}',
  function (this: AuthWorld, kind: string, name: string) {
    const found = searchResults(this).some(
      (r) => r.kind === kind && r.name === name,
    );
    assert.ok(
      found,
      `expected a ${kind} named "${name}" among ${JSON.stringify(searchResults(this))}`,
    );
  },
);

Then(
  'the search result {string} carries latitude {float} and longitude {float}',
  function (
    this: AuthWorld,
    name: string,
    latitude: number,
    longitude: number,
  ) {
    const result = searchResults(this).find((r) => r.name === name);
    assert.ok(result, `expected a search result named "${name}"`);
    assert.ok(
      Math.abs(result.latitude - latitude) < 1e-6,
      `latitude was ${result.latitude}`,
    );
    assert.ok(
      Math.abs(result.longitude - longitude) < 1e-6,
      `longitude was ${result.longitude}`,
    );
  },
);

// A ROUTE hit flies the map to the route's own coordinates but opens its
// parent crag's panel -- the panel is per-crag, so the id has to travel
// with the search result or the frontend would need a second lookup.
Then(
  'the search result {string} carries the id of its parent crag',
  async function (this: AuthWorld, name: string) {
    const result = searchResults(this).find(
      (r) => r.name === name && r.kind === 'ROUTE',
    );
    assert.ok(result, `expected a ROUTE search result named "${name}"`);
    const dataSource = this.app.get(DataSource);
    const rows: Array<{ crag_id: string }> = await dataSource.query(
      'SELECT crag_id FROM routes WHERE id = $1',
      [result.id],
    );
    assert.equal(result.cragId, rows[0].crag_id);
  },
);

Then('the search results are empty', function (this: AuthWorld) {
  assert.deepEqual(searchResults(this), []);
});

// --- BL-022: proving the absence of an external geocoder --------------------
//
// Foundation §9/§18 rule out an external geocoding service for the MVP.
// "We didn't write one" is not something a positive test can show, so this
// records every outbound HTTP/HTTPS request and every fetch() the process
// makes while the search runs, and asserts none of them left the machine.
// Requests to localhost are expected and ignored -- supertest itself
// reaches the in-process Nest server over loopback, so failing on *any*
// outbound request would fail every scenario trivially.

type RequestPatch = {
  httpRequest: typeof http.request;
  httpsRequest: typeof https.request;
  fetch: typeof globalThis.fetch;
};

let patched: RequestPatch | null = null;
let recordedHosts: string[] = [];

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

function recordHost(host: string | undefined): void {
  const bare = (host ?? '').split(':')[0].toLowerCase();
  if (!LOOPBACK.has(bare)) {
    recordedHosts.push(bare);
  }
}

function restore(): void {
  if (!patched) {
    return;
  }
  http.request = patched.httpRequest;
  https.request = patched.httpsRequest;
  globalThis.fetch = patched.fetch;
  patched = null;
}

Given('outbound HTTP calls to external hosts are being recorded', function () {
  recordedHosts = [];
  patched = {
    httpRequest: http.request,
    httpsRequest: https.request,
    fetch: globalThis.fetch,
  };

  const wrap =
    (original: typeof http.request) =>
    (...args: Parameters<typeof http.request>) => {
      const [target] = args;
      if (typeof target === 'string') {
        recordHost(new URL(target).hostname);
      } else if (target instanceof URL) {
        recordHost(target.hostname);
      } else if (target && typeof target === 'object') {
        recordHost(
          (target as { hostname?: string; host?: string }).hostname ??
            (target as { host?: string }).host,
        );
      }
      return original(...args);
    };

  http.request = wrap(http.request) as typeof http.request;
  https.request = wrap(https.request) as typeof https.request;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    recordHost(new URL(url).hostname);
    return originalFetch(input, init);
  };
});

Then('no outbound call was made to any external host', function () {
  const hosts = [...recordedHosts];
  restore();
  assert.deepEqual(
    hosts,
    [],
    `expected the search to hit our own database only, but calls went out to: ${hosts.join(', ')}`,
  );
});

// Belt and braces: if a scenario fails before reaching the Then above, the
// patch would otherwise leak into every later scenario in the same process.
After(function () {
  restore();
});
