import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

// BL-011 / BL-012 -- Architecture.md AR-16/AR-17: mirrors
// route-verification.steps.ts's shape almost exactly (X-Test-Mock-Auth for
// the acting climber/admin, X-Test-Mock-GPS for the verifier's physical
// location) -- see that file's header comment for why cookie-based login
// doesn't work once a scenario needs more than one concurrently-active
// identity.

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

async function findGymId(
  dataSource: DataSource,
  gymName: string,
): Promise<string> {
  const [gym] = await dataSource.query(
    'SELECT id FROM gyms WHERE name = $1',
    [gymName],
  );
  assert.ok(gym?.id, `expected a seeded gym named "${gymName}"`);
  return gym.id as string;
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

// Same ST_Project technique as route-verification.steps.ts's
// offsetPointFromRoute, against `gyms` instead of `routes`.
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

function parseDisciplines(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(',').map((d) => d.trim());
}

// Uploads a fresh GYM_VERIFICATION_PHOTO for `email` (via X-Test-Mock-Auth)
// and submits the gym verification from a point exactly `meters` away from
// the gym, with the given disciplines. Leaves `world.response` set to the
// verification submission's response.
async function performGymVerification(
  world: AuthWorld,
  email: string,
  gymName: string,
  meters: number,
  disciplines: string[],
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const gymId = await findGymId(dataSource, gymName);
  const userId = await findUserId(dataSource, email);
  const { lat, lng } = await offsetPointFromGym(dataSource, gymId, meters);

  const mediaRes = await world.http
    .post('/api/media')
    .set('X-Test-Mock-Auth', userId)
    .field('purpose', 'GYM_VERIFICATION_PHOTO')
    .attach('file', Buffer.alloc(1024, 0xbb), {
      filename: 'gym-verification-photo.jpg',
      contentType: 'image/jpeg',
    });
  assert.equal(
    mediaRes.status,
    201,
    `seed photo upload failed: ${JSON.stringify(mediaRes.body)}`,
  );

  world.response = await world.http
    .post(`/api/gyms/${gymId}/verifications`)
    .set('X-Test-Mock-Auth', userId)
    .set('X-Test-Mock-GPS', `${lat},${lng}`)
    .send({
      mediaAssetId: mediaRes.body.id as string,
      disciplinesSubmitted: disciplines,
    });
}

// Seeds `count` distinct, already-verified climbers directly via SQL --
// fixture setup for the 4th-verification/union scenario, not the behavior
// under test (same "seed directly, bypass HTTP" convention as
// route-verification.steps.ts's seedVerifications).
async function seedGymVerifications(
  world: AuthWorld,
  gymName: string,
  count: number,
  disciplines: string[],
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const gymId = await findGymId(dataSource, gymName);

  for (let i = 0; i < count; i++) {
    const email = `seed-gym-verifier-${i}-${gymName.replace(/\s+/g, '')}@example.com`;
    await registerIfAbsent(world, email, 'Seed Verifier');
    const userId = await findUserId(dataSource, email);

    const [media] = await dataSource.query(
      `INSERT INTO media_assets (owner_user_id, purpose, payload, mime_type, byte_size, etag)
       VALUES ($1, 'GYM_VERIFICATION_PHOTO', $2, 'image/jpeg', 3, $3)
       RETURNING id`,
      [userId, Buffer.from([1, 2, 3]), `seed-etag-${email}`],
    );
    await dataSource.query(
      `INSERT INTO gym_verifications (gym_id, verifier_user_id, media_asset_id, disciplines_submitted)
       VALUES ($1, $2, $3, $4::gym_discipline[])`,
      [gymId, userId, media.id, disciplines],
    );
  }
}

Given(
  '{string} already has {int} existing verifications with disciplines {string}',
  async function (
    this: AuthWorld,
    gymName: string,
    count: number,
    disciplinesRaw: string,
  ) {
    await seedGymVerifications(this, gymName, count, parseDisciplines(disciplinesRaw));
  },
);

Given(
  '{string} is a registered SYSTEM_ADMIN',
  async function (this: AuthWorld, email: string) {
    await registerIfAbsent(this, email, 'System Admin');
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE users SET role = 'SYSTEM_ADMIN' WHERE email = $1`,
      [email],
    );
  },
);

When(
  '{string} verifies gym {string} from {int} meters away with disciplines {string}',
  async function (
    this: AuthWorld,
    email: string,
    gymName: string,
    meters: number,
    disciplinesRaw: string,
  ) {
    await performGymVerification(
      this,
      email,
      gymName,
      meters,
      parseDisciplines(disciplinesRaw),
    );
  },
);

When(
  '{string} verifies gym {string} from {int} meters away with no disciplines selected',
  async function (
    this: AuthWorld,
    email: string,
    gymName: string,
    meters: number,
  ) {
    await performGymVerification(this, email, gymName, meters, []);
  },
);

When(
  'a 4th unique Verified Climber {string} verifies gym {string} from {int} meters away with disciplines {string}',
  async function (
    this: AuthWorld,
    email: string,
    gymName: string,
    meters: number,
    disciplinesRaw: string,
  ) {
    await registerIfAbsent(this, email, 'Fourth Verifier');
    await performGymVerification(
      this,
      email,
      gymName,
      meters,
      parseDisciplines(disciplinesRaw),
    );
  },
);

When(
  '{string} directly verifies gym {string} with disciplines {string}',
  async function (
    this: AuthWorld,
    email: string,
    gymName: string,
    disciplinesRaw: string,
  ) {
    const dataSource = this.app.get(DataSource);
    const gymId = await findGymId(dataSource, gymName);
    const userId = await findUserId(dataSource, email);

    this.response = await this.http
      .patch(`/api/gyms/${gymId}/admin-verify`)
      .set('X-Test-Mock-Auth', userId)
      .send({ disciplinesOffered: parseDisciplines(disciplinesRaw) });
  },
);

Then('the gym verification succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then(
  'the gym verification is rejected as a validation error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 400, JSON.stringify(this.response.body));
  },
);

Then(
  'the gym verification is rejected as forbidden',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
  },
);

Then(
  'the gym verification is rejected with a proximity error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
  },
);

Then('the admin gym verification succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then(
  'the admin gym verification is rejected as forbidden',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
  },
);

Then(
  'a gym_verifications row exists for {string} and {string} with disciplines {string}',
  async function (
    this: AuthWorld,
    email: string,
    gymName: string,
    disciplinesRaw: string,
  ) {
    const dataSource = this.app.get(DataSource);
    // array_to_string sidesteps node-postgres's lack of a type parser for
    // a custom ENUM array's OID (same reasoning as gym-submission.steps.ts's
    // cardinality() trick) -- compare a plain CSV string instead of
    // fighting client-side array parsing.
    const rows = await dataSource.query(
      `SELECT array_to_string(gv.disciplines_submitted, ',') AS disciplines_csv
       FROM gym_verifications gv
       JOIN users u ON u.id = gv.verifier_user_id
       JOIN gyms g ON g.id = gv.gym_id
       WHERE u.email = $1 AND g.name = $2`,
      [email, gymName],
    );
    assert.equal(
      rows.length,
      1,
      `expected exactly one gym_verifications row for ${email}/${gymName}`,
    );
    const actual = (rows[0].disciplines_csv as string)
      .split(',')
      .map((d) => d.trim())
      .sort();
    const expected = parseDisciplines(disciplinesRaw).sort();
    assert.deepEqual(actual, expected);
  },
);

Then(
  'gym {string} becomes VERIFIED',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      'SELECT status FROM gyms WHERE name = $1',
      [gymName],
    );
    assert.equal(rows[0]?.status, 'VERIFIED');
  },
);

Then(
  'gym {string} was verified directly by an admin',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      'SELECT verified_directly_by_admin FROM gyms WHERE name = $1',
      [gymName],
    );
    assert.equal(rows[0]?.verified_directly_by_admin, true);
  },
);

Then(
  'gym {string} offers disciplines {string}',
  async function (this: AuthWorld, gymName: string, disciplinesRaw: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT array_to_string(disciplines_offered, ',') AS disciplines_csv FROM gyms WHERE name = $1`,
      [gymName],
    );
    assert.equal(rows.length, 1, `expected exactly one gym named "${gymName}"`);
    const actual = ((rows[0].disciplines_csv as string) ?? '')
      .split(',')
      .filter(Boolean)
      .map((d) => d.trim())
      .sort();
    const expected = parseDisciplines(disciplinesRaw).sort();
    assert.deepEqual(actual, expected);
  },
);
