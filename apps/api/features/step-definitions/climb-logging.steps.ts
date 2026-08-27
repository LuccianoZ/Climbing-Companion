import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

// BL-017 / BL-018: same locally-duplicated helper shapes as
// route-verification.steps.ts / grade-consensus.steps.ts (this codebase's
// established per-feature-file convention -- see those files' comments).

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

async function performLog(
  world: AuthWorld,
  email: string,
  routeName: string,
  meters: number,
  outcome: string,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const routeId = await findRouteId(dataSource, routeName);
  const userId = await findUserId(dataSource, email);
  const { lat, lng } = await offsetPointFromRoute(dataSource, routeId, meters);

  world.response = await world.http
    .post(`/api/routes/${routeId}/climb-logs`)
    .set('X-Test-Mock-Auth', userId)
    .set('X-Test-Mock-GPS', `${lat},${lng}`)
    .send({ outcome });
}

When(
  '{string} logs {string} as {word} from {int} meters away',
  async function (
    this: AuthWorld,
    email: string,
    routeName: string,
    outcome: string,
    meters: number,
  ) {
    await performLog(this, email, routeName, meters, outcome);
  },
);

Then('the log succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then('the log is rejected with a proximity error', function (this: AuthWorld) {
  assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
});

Then(
  'a climb_logs row exists for {string} and {string} with outcome {string} and grade snapshot {int}',
  async function (
    this: AuthWorld,
    email: string,
    routeName: string,
    outcome: string,
    gradeSnapshotOrdinal: number,
  ) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT cl.outcome, cl.grade_snapshot_ordinal FROM climb_logs cl
       JOIN users u ON u.id = cl.user_id
       JOIN routes r ON r.id = cl.route_id
       WHERE u.email = $1 AND r.name = $2 AND cl.outcome = $3
       ORDER BY cl.logged_at DESC
       LIMIT 1`,
      [email, routeName, outcome],
    );
    assert.equal(rows.length, 1, `expected a climb_logs row for ${email}/${routeName}/${outcome}`);
    assert.equal(rows[0].grade_snapshot_ordinal, gradeSnapshotOrdinal);
  },
);

Then(
  '{int} climb_logs rows exist for {string} and {string} with outcome {string}',
  async function (
    this: AuthWorld,
    count: number,
    email: string,
    routeName: string,
    outcome: string,
  ) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT cl.id FROM climb_logs cl
       JOIN users u ON u.id = cl.user_id
       JOIN routes r ON r.id = cl.route_id
       WHERE u.email = $1 AND r.name = $2 AND cl.outcome = $3`,
      [email, routeName, outcome],
    );
    assert.equal(rows.length, count);
  },
);
