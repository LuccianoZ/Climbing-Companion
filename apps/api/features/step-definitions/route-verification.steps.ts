import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

// BL-009 / Architecture.md AR-16: unlike every other feature file so far,
// route-verification.feature needs several concurrently-authenticated
// actors within a single scenario (a route's submitter plus one or more
// independent verifiers), and AuthWorld only ever tracks one active
// session cookie at a time. These steps authenticate the acting climber
// via the X-Test-Mock-Auth bypass header instead of a cookie, and the
// verifier's physical location via X-Test-Mock-GPS -- both already
// fail-closed, test-only substitutes for their real-request equivalents
// (see mock-auth.guard.ts / mock-gps.guard.ts).

async function findUserId(
  dataSource: DataSource,
  email: string,
): Promise<string> {
  const [user] = await dataSource.query(
    'SELECT id FROM users WHERE email = $1',
    [email],
  );
  assert.ok(user?.id, `expected a registered user ${email}`);
  return user.id as string;
}

async function findRouteId(
  dataSource: DataSource,
  routeName: string,
): Promise<string> {
  const [route] = await dataSource.query(
    'SELECT id FROM routes WHERE name = $1',
    [routeName],
  );
  assert.ok(route?.id, `expected a seeded route named "${routeName}"`);
  return route.id as string;
}

async function registerIfAbsent(
  world: AuthWorld,
  email: string,
  displayName: string,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const [existing] = await dataSource.query(
    'SELECT id FROM users WHERE email = $1',
    [email],
  );
  if (existing) {
    return;
  }
  const res = await world.http.post('/api/auth/register').send({
    email,
    password: 'correct horse battery staple',
    displayName,
  });
  assert.equal(
    res.status,
    201,
    `registration failed: ${JSON.stringify(res.body)}`,
  );
}

// PostGIS ST_Project computes an exact geodesic point at `meters`/azimuth
// from the route's own stored location -- using the same geodesic engine
// ST_DWithin checks against, rather than a flat-earth degrees-per-meter
// approximation, is what makes the 299m/301m boundary pair (BL-014)
// trustworthy regardless of latitude. `$2::float8` is required, not
// decorative: dataSource.query()'s raw parameterized SQL sends `meters`
// with an unresolved type, and ST_Project has more than one overload that
// matches an unresolved-type argument equally well -- Postgres raises
// "function st_project(geography, unknown, double precision) is not
// unique" without the cast pinning it.
async function offsetPointFromRoute(
  dataSource: DataSource,
  routeId: string,
  meters: number,
): Promise<{ lat: number; lng: number }> {
  const [point] = await dataSource.query(
    `SELECT ST_Y(pt::geometry) AS lat, ST_X(pt::geometry) AS lng
     FROM (SELECT ST_Project("location", $2::float8, radians(0)) AS pt FROM "routes" WHERE "id" = $1::uuid) t`,
    [routeId, meters],
  );
  assert.ok(
    point,
    `expected to compute an offset point for route "${routeId}"`,
  );
  return { lat: Number(point.lat), lng: Number(point.lng) };
}

// Uploads a fresh ROUTE_VERIFICATION_PHOTO for `email` (via X-Test-Mock-Auth,
// same as the verification submission itself) and submits the verification
// from a point exactly `meters` away from the route, with the given grade
// vote. Leaves `world.response` set to the verification submission's
// response, mirroring every other feature file's convention of asserting
// against `this.response` in Then steps.
async function performVerification(
  world: AuthWorld,
  email: string,
  routeName: string,
  meters: number,
  gradeOrdinal: number,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const routeId = await findRouteId(dataSource, routeName);
  const userId = await findUserId(dataSource, email);
  const { lat, lng } = await offsetPointFromRoute(dataSource, routeId, meters);

  const mediaRes = await world.http
    .post('/api/media')
    .set('X-Test-Mock-Auth', userId)
    .field('purpose', 'ROUTE_VERIFICATION_PHOTO')
    .attach('file', Buffer.alloc(1024, 0xaa), {
      filename: 'verification-photo.jpg',
      contentType: 'image/jpeg',
    });
  assert.equal(
    mediaRes.status,
    201,
    `seed photo upload failed: ${JSON.stringify(mediaRes.body)}`,
  );

  world.response = await world.http
    .post(`/api/routes/${routeId}/verifications`)
    .set('X-Test-Mock-Auth', userId)
    .set('X-Test-Mock-GPS', `${lat},${lng}`)
    .send({ mediaAssetId: mediaRes.body.id as string, gradeOrdinal });
}

// Seeds `count` distinct, already-verified climbers directly via SQL --
// fixture setup for scenarios that need pre-existing verifications, not the
// behavior under test (same "seed directly, bypass HTTP" convention as
// route-submission.steps.ts's "already exists" crag seeding step).
async function seedVerifications(
  world: AuthWorld,
  routeName: string,
  count: number,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const routeId = await findRouteId(dataSource, routeName);

  for (let i = 0; i < count; i++) {
    const email = `seed-verifier-${i}-${routeName.replace(/\s+/g, '')}@example.com`;
    await registerIfAbsent(world, email, 'Seed Verifier');
    const userId = await findUserId(dataSource, email);

    const [media] = await dataSource.query(
      `INSERT INTO media_assets (owner_user_id, purpose, payload, mime_type, byte_size, etag)
       VALUES ($1, 'ROUTE_VERIFICATION_PHOTO', $2, 'image/jpeg', 3, $3)
       RETURNING id`,
      [userId, Buffer.from([1, 2, 3]), `seed-etag-${email}`],
    );
    await dataSource.query(
      `INSERT INTO route_verifications (route_id, verifier_user_id, media_asset_id)
       VALUES ($1, $2, $3)`,
      [routeId, userId, media.id],
    );
    await dataSource.query(
      `INSERT INTO route_grade_votes (route_id, voter_user_id, grade_ordinal)
       VALUES ($1, $2, 10)
       ON CONFLICT (route_id, voter_user_id) DO UPDATE SET grade_ordinal = EXCLUDED.grade_ordinal`,
      [routeId, userId],
    );
  }
}

Given(
  '{string} already has {int} existing verifications',
  async function (this: AuthWorld, routeName: string, count: number) {
    await seedVerifications(this, routeName, count);
  },
);

Given(
  '{string} already has {int} verifications and is VERIFIED',
  async function (this: AuthWorld, routeName: string, count: number) {
    await seedVerifications(this, routeName, count);
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE routes SET status = 'VERIFIED', verified_at = now() WHERE name = $1`,
      [routeName],
    );
  },
);

Given(
  '{string} has already verified {string}',
  async function (this: AuthWorld, email: string, routeName: string) {
    await performVerification(this, email, routeName, 50, 10);
    assert.equal(
      this.response.status,
      201,
      `expected the seed verification to succeed: ${JSON.stringify(this.response.body)}`,
    );
  },
);

When(
  '{string} verifies {string} from {int} meters away with grade vote {int}',
  async function (
    this: AuthWorld,
    email: string,
    routeName: string,
    meters: number,
    gradeOrdinal: number,
  ) {
    await performVerification(this, email, routeName, meters, gradeOrdinal);
  },
);

When(
  'a 4th unique Verified Climber {string} verifies {string} from {int} meters away with grade vote {int}',
  async function (
    this: AuthWorld,
    email: string,
    routeName: string,
    meters: number,
    gradeOrdinal: number,
  ) {
    await registerIfAbsent(this, email, 'Fourth Verifier');
    await performVerification(this, email, routeName, meters, gradeOrdinal);
  },
);

When(
  'a fifth Verified Climber {string} verifies {string} from {int} meters away with grade vote {int}',
  async function (
    this: AuthWorld,
    email: string,
    routeName: string,
    meters: number,
    gradeOrdinal: number,
  ) {
    await registerIfAbsent(this, email, 'Fifth Verifier');
    await performVerification(this, email, routeName, meters, gradeOrdinal);
  },
);

Then('the verification succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then('the verification is rejected as forbidden', function (this: AuthWorld) {
  assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
});

Then(
  'the verification is rejected with a proximity error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
  },
);

Then('the verification is rejected as a conflict', function (this: AuthWorld) {
  assert.equal(this.response.status, 409, JSON.stringify(this.response.body));
});

Then(
  'the verification is rejected with a clean 4xx, not a 500',
  function (this: AuthWorld) {
    assert.ok(
      this.response.status >= 400 && this.response.status < 500,
      `expected a 4xx status, got ${this.response.status}: ${JSON.stringify(this.response.body)}`,
    );
  },
);

Then(
  'a route_verifications row exists for {string} and {string}',
  async function (this: AuthWorld, email: string, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT rv.id FROM route_verifications rv
       JOIN users u ON u.id = rv.verifier_user_id
       JOIN routes r ON r.id = rv.route_id
       WHERE u.email = $1 AND r.name = $2`,
      [email, routeName],
    );
    assert.equal(
      rows.length,
      1,
      `expected exactly one route_verifications row for ${email}/${routeName}`,
    );
  },
);

Then(
  'no route_verifications row exists for {string} and {string}',
  async function (this: AuthWorld, email: string, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT rv.id FROM route_verifications rv
       JOIN users u ON u.id = rv.verifier_user_id
       JOIN routes r ON r.id = rv.route_id
       WHERE u.email = $1 AND r.name = $2`,
      [email, routeName],
    );
    assert.equal(rows.length, 0);
  },
);

Then(
  'a route_grade_votes row exists for {string} and {string} with grade {int}',
  async function (
    this: AuthWorld,
    email: string,
    routeName: string,
    gradeOrdinal: number,
  ) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT gv.grade_ordinal FROM route_grade_votes gv
       JOIN users u ON u.id = gv.voter_user_id
       JOIN routes r ON r.id = gv.route_id
       WHERE u.email = $1 AND r.name = $2`,
      [email, routeName],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].grade_ordinal, gradeOrdinal);
  },
);

Then(
  'the verification count for {string} remains 0',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT count(*)::int AS count FROM route_verifications rv
       JOIN routes r ON r.id = rv.route_id WHERE r.name = $1`,
      [routeName],
    );
    assert.equal(rows[0].count, 0);
  },
);

Then(
  '{string} becomes VERIFIED',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      'SELECT status FROM routes WHERE name = $1',
      [routeName],
    );
    assert.equal(rows[0]?.status, 'VERIFIED');
  },
);

Then(
  'the crag for {string} becomes VERIFIED',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT c.status FROM crags c JOIN routes r ON r.crag_id = c.id WHERE r.name = $1`,
      [routeName],
    );
    assert.equal(rows[0]?.status, 'VERIFIED');
  },
);

Then(
  'the crag for {string} remains UNVERIFIED',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT c.status FROM crags c JOIN routes r ON r.crag_id = c.id WHERE r.name = $1`,
      [routeName],
    );
    assert.equal(rows[0]?.status, 'UNVERIFIED');
  },
);
