import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

// BL-015 / BL-016: same helper shapes as route-verification.steps.ts
// (findUserId/findRouteId/registerIfAbsent/offsetPointFromRoute) --
// duplicated locally rather than imported cross-file, matching this
// codebase's established per-feature-file convention (gym-verification.steps.ts
// does the same rather than sharing a common steps-helpers module).

async function findUserId(dataSource: DataSource, email: string): Promise<string> {
  const [user] = await dataSource.query('SELECT id FROM users WHERE email = $1', [email]);
  assert.ok(user?.id, `expected a registered user ${email}`);
  return user.id as string;
}

async function findRouteId(dataSource: DataSource, routeName: string): Promise<string> {
  const [route] = await dataSource.query('SELECT id FROM routes WHERE name = $1', [routeName]);
  assert.ok(route?.id, `expected a seeded route named "${routeName}"`);
  return route.id as string;
}

async function registerIfAbsent(
  world: AuthWorld,
  email: string,
  displayName: string,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const [existing] = await dataSource.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    return;
  }
  const res = await world.http.post('/api/auth/register').send({
    email,
    password: 'correct horse battery staple',
    displayName,
  });
  assert.equal(res.status, 201, `registration failed: ${JSON.stringify(res.body)}`);
}

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
  assert.ok(point, `expected to compute an offset point for route "${routeId}"`);
  return { lat: Number(point.lat), lng: Number(point.lng) };
}

// Seeds one distinct voter per table row directly via SQL -- fixture setup
// for the plurality/tie/distribution scenarios, not the behavior under
// test (same "seed directly, bypass HTTP" convention as
// route-verification.steps.ts's seedVerifications).
async function seedGradeVotes(
  world: AuthWorld,
  routeName: string,
  table: DataTable,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const routeId = await findRouteId(dataSource, routeName);
  const rows = table.hashes();

  for (let i = 0; i < rows.length; i++) {
    const email = `grade-voter-${i}-${routeName.replace(/\s+/g, '')}@example.com`;
    await registerIfAbsent(world, email, 'Seed Voter');
    const userId = await findUserId(dataSource, email);
    await dataSource.query(
      `INSERT INTO route_grade_votes (route_id, voter_user_id, grade_ordinal)
       VALUES ($1, $2, $3)
       ON CONFLICT (route_id, voter_user_id) DO UPDATE SET grade_ordinal = EXCLUDED.grade_ordinal`,
      [routeId, userId, Number(rows[i].gradeOrdinal)],
    );
  }
}

async function performVote(
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

  world.response = await world.http
    .post(`/api/routes/${routeId}/grade-votes`)
    .set('X-Test-Mock-Auth', userId)
    .set('X-Test-Mock-GPS', `${lat},${lng}`)
    .send({ gradeOrdinal });
}

async function queryConsensus(world: AuthWorld, routeName: string): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const routeId = await findRouteId(dataSource, routeName);
  world.response = await world.http.get(`/api/routes/${routeId}/grade-votes/consensus`);
}

Given(
  '{string} has these grade votes:',
  async function (this: AuthWorld, routeName: string, table: DataTable) {
    await seedGradeVotes(this, routeName, table);
  },
);

When(
  '{string} votes on the grade of {string} as {int} from {int} meters away',
  async function (
    this: AuthWorld,
    email: string,
    routeName: string,
    gradeOrdinal: number,
    meters: number,
  ) {
    await performVote(this, email, routeName, meters, gradeOrdinal);
  },
);

When('the grade consensus for {string} is queried', async function (this: AuthWorld, routeName: string) {
  await queryConsensus(this, routeName);
});

When(
  'the grade consensus for {string} is queried as an unauthenticated Visitor',
  async function (this: AuthWorld, routeName: string) {
    await queryConsensus(this, routeName);
  },
);

Then('the vote succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then('the vote is rejected with a proximity error', function (this: AuthWorld) {
  assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
});

Then('the consensus response succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then(
  'the consensus response shows source {string} and grade {int}',
  function (this: AuthWorld, source: string, gradeOrdinal: number) {
    assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
    assert.equal(this.response.body.source, source);
    assert.equal(this.response.body.gradeOrdinal, gradeOrdinal);
  },
);

Then(
  'the consensus response includes {int} total votes',
  function (this: AuthWorld, totalVotes: number) {
    assert.equal(this.response.body.totalVotes, totalVotes);
  },
);

Then('no route_grade_votes row exists yet for {string}', async function (this: AuthWorld, routeName: string) {
  const dataSource = this.app.get(DataSource);
  const rows = await dataSource.query(
    `SELECT gv.route_id FROM route_grade_votes gv
     JOIN routes r ON r.id = gv.route_id
     WHERE r.name = $1`,
    [routeName],
  );
  assert.equal(rows.length, 0);
});
