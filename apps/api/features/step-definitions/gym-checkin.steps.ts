import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

// BL-024: same locally-duplicated helper shapes as climb-logging.steps.ts /
// gym-verification.steps.ts (this codebase's established per-feature-file
// convention -- see those files' comments), against `gyms` instead of
// `routes`.

async function findUserId(dataSource: DataSource, email: string): Promise<string> {
  const [user] = await dataSource.query('SELECT id FROM users WHERE email = $1', [email]);
  assert.ok(user?.id, `expected a registered user ${email}`);
  return user.id as string;
}

async function findGymId(dataSource: DataSource, gymName: string): Promise<string> {
  const [gym] = await dataSource.query('SELECT id FROM gyms WHERE name = $1', [gymName]);
  assert.ok(gym?.id, `expected a seeded gym named "${gymName}"`);
  return gym.id as string;
}

async function offsetPointFromGym(
  dataSource: DataSource,
  gymId: string,
  meters: number,
): Promise<{ lat: number; lng: number }> {
  const [point] = await dataSource.query(
    `SELECT ST_Y(pt::geometry) AS lat, ST_X(pt::geometry) AS lng
     FROM (SELECT ST_Project("location", $2::float8, radians(0)) AS pt FROM "gyms" WHERE "id" = $1::uuid) t`,
    [gymId, meters],
  );
  assert.ok(point, `expected to compute an offset point for gym "${gymId}"`);
  return { lat: Number(point.lat), lng: Number(point.lng) };
}

async function performCheckIn(
  world: AuthWorld,
  email: string,
  gymName: string,
  meters: number,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const gymId = await findGymId(dataSource, gymName);
  const userId = await findUserId(dataSource, email);
  const { lat, lng } = await offsetPointFromGym(dataSource, gymId, meters);

  world.response = await world.http
    .post(`/api/gyms/${gymId}/check-ins`)
    .set('X-Test-Mock-Auth', userId)
    .set('X-Test-Mock-GPS', `${lat},${lng}`)
    .send({});
}

When(
  '{string} checks in at gym {string} from {int} meters away',
  async function (this: AuthWorld, email: string, gymName: string, meters: number) {
    await performCheckIn(this, email, gymName, meters);
  },
);

Then('the check-in succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then('the check-in is rejected with a proximity error', function (this: AuthWorld) {
  assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
});

Then(
  'a gym_checkins row exists for {string} and {string}',
  async function (this: AuthWorld, email: string, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT gc.id FROM gym_checkins gc
       JOIN users u ON u.id = gc.user_id
       JOIN gyms g ON g.id = gc.gym_id
       WHERE u.email = $1 AND g.name = $2`,
      [email, gymName],
    );
    assert.ok(
      rows.length >= 1,
      `expected at least one gym_checkins row for ${email}/${gymName}`,
    );
  },
);

Then(
  '{int} gym_checkins rows exist for {string} and {string}',
  async function (this: AuthWorld, count: number, email: string, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT gc.id FROM gym_checkins gc
       JOIN users u ON u.id = gc.user_id
       JOIN gyms g ON g.id = gc.gym_id
       WHERE u.email = $1 AND g.name = $2`,
      [email, gymName],
    );
    assert.equal(rows.length, count);
  },
);
