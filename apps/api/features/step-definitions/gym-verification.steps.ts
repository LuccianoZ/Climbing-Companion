import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

// BL-011 / BL-012 + AR-51 BL-x06: gym verification is now a confirm/dispute
// step. A verifier within 300m answers "is the submission info accurate?":
//   - "Yes" -> a gym_verifications row (photo OPTIONAL, no disciplines);
//     the 4th flips gyms.status to VERIFIED.
//   - "No"  -> a gym_information_disputes row; does NOT count toward the 4.
//
// Actors act via X-Test-Mock-Auth + X-Test-Mock-GPS (AR-16) -- a scenario
// has several concurrently-authenticated identities and AuthWorld tracks
// only one cookie.

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
  const [gym] = await dataSource.query('SELECT id FROM gyms WHERE name = $1', [
    gymName,
  ]);
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
  if (existing) return;
  const res = await world.http
    .post('/api/auth/register')
    .send({ email, password: 'correct horse battery staple', displayName });
  assert.equal(res.status, 201, `registration failed: ${JSON.stringify(res.body)}`);
}

// ST_Project a point exactly `meters` due north of the gym.
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

// A "Yes, accurate" confirmation from `email`, `meters` from the gym, with
// an optional freshly-uploaded photo. Leaves world.response set.
async function confirmGym(
  world: AuthWorld,
  email: string,
  gymName: string,
  meters: number,
  withPhoto: boolean,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const gymId = await findGymId(dataSource, gymName);
  const userId = await findUserId(dataSource, email);
  const { lat, lng } = await offsetPointFromGym(dataSource, gymId, meters);

  const body: Record<string, unknown> = { informationAccurate: true };
  if (withPhoto) {
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
    body.mediaAssetId = mediaRes.body.id as string;
  }

  world.response = await world.http
    .post(`/api/gyms/${gymId}/verifications`)
    .set('X-Test-Mock-Auth', userId)
    .set('X-Test-Mock-GPS', `${lat},${lng}`)
    .send(body);
}

async function disputeGym(
  world: AuthWorld,
  email: string,
  gymName: string,
  meters: number,
  detail: string,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const gymId = await findGymId(dataSource, gymName);
  const userId = await findUserId(dataSource, email);
  const { lat, lng } = await offsetPointFromGym(dataSource, gymId, meters);

  world.response = await world.http
    .post(`/api/gyms/${gymId}/verifications`)
    .set('X-Test-Mock-Auth', userId)
    .set('X-Test-Mock-GPS', `${lat},${lng}`)
    .send({ informationAccurate: false, disputeDetail: detail });
}

// Seeds `count` distinct verified climbers with a gym_verifications row each
// -- fixture setup for the 4th-confirmation scenario. No disciplines
// (the column is nullable now), a seeded photo per row.
async function seedGymConfirmations(
  world: AuthWorld,
  gymName: string,
  count: number,
): Promise<void> {
  const dataSource = world.app.get(DataSource);
  const gymId = await findGymId(dataSource, gymName);

  for (let i = 0; i < count; i += 1) {
    const email = `seed-gym-confirmer-${i}-${gymName.replace(/\s+/g, '')}@example.com`;
    await registerIfAbsent(world, email, 'Seed Confirmer');
    const userId = await findUserId(dataSource, email);
    const [media] = await dataSource.query(
      `INSERT INTO media_assets (owner_user_id, purpose, payload, mime_type, byte_size, etag)
       VALUES ($1, 'GYM_VERIFICATION_PHOTO', $2, 'image/jpeg', 3, $3)
       RETURNING id`,
      [userId, Buffer.from([1, 2, 3]), `seed-etag-${email}`],
    );
    await dataSource.query(
      `INSERT INTO gym_verifications (gym_id, verifier_user_id, media_asset_id)
       VALUES ($1, $2, $3)`,
      [gymId, userId, media.id],
    );
  }
}

function parseDisciplines(raw: string): string[] {
  const trimmed = raw.trim();
  return trimmed ? trimmed.split(',').map((d) => d.trim()) : [];
}

// --- Given -------------------------------------------------------------------

Given(
  '{string} already has {int} confirmations',
  async function (this: AuthWorld, gymName: string, count: number) {
    await seedGymConfirmations(this, gymName, count);
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

// --- When: confirm / dispute ----------------------------------------------

When(
  '{string} confirms gym {string} from {int} meters away',
  async function (this: AuthWorld, email: string, gymName: string, meters: number) {
    await confirmGym(this, email, gymName, meters, true);
  },
);

When(
  '{string} confirms gym {string} from {int} meters away without a photo',
  async function (this: AuthWorld, email: string, gymName: string, meters: number) {
    await confirmGym(this, email, gymName, meters, false);
  },
);

When(
  'a 4th unique Verified Climber {string} confirms gym {string} from {int} meters away',
  async function (this: AuthWorld, email: string, gymName: string, meters: number) {
    await registerIfAbsent(this, email, 'Fourth Confirmer');
    await confirmGym(this, email, gymName, meters, true);
  },
);

When(
  '{string} disputes gym {string} from {int} meters away because {string}',
  async function (
    this: AuthWorld,
    email: string,
    gymName: string,
    meters: number,
    detail: string,
  ) {
    await disputeGym(this, email, gymName, meters, detail);
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

When(
  '{string} resolves the open dispute for gym {string}',
  async function (this: AuthWorld, email: string, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const gymId = await findGymId(dataSource, gymName);
    const userId = await findUserId(dataSource, email);

    const queue = await this.http
      .get('/api/admin/gym-disputes')
      .set('X-Test-Mock-Auth', userId);
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    const row = (queue.body as Array<{ id: string; gymId: string }>).find(
      (d) => d.gymId === gymId,
    );
    assert.ok(row, `expected an open dispute for gym "${gymName}"`);

    this.response = await this.http
      .post(`/api/admin/gym-disputes/${row.id}/resolve`)
      .set('X-Test-Mock-Auth', userId);
  },
);

// --- Then ------------------------------------------------------------------

Then('the gym confirmation succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then('the gym dispute is recorded', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
  assert.equal(
    (this.response.body as { outcome?: string }).outcome,
    'DISPUTED',
    JSON.stringify(this.response.body),
  );
});

Then('the gym confirmation is rejected as forbidden', function (this: AuthWorld) {
  assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
});

Then(
  'the gym confirmation is rejected with a proximity error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
  },
);

Then(
  'the gym confirmation is rejected as a validation error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 400, JSON.stringify(this.response.body));
  },
);

Then(
  'the gym confirmation is rejected as a conflict',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 409, JSON.stringify(this.response.body));
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

Then('the dispute resolution succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then(
  'gym {string} has {int} open information dispute(s)',
  async function (this: AuthWorld, gymName: string, count: number) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT count(*)::int AS n
       FROM gym_information_disputes d
       JOIN gyms g ON g.id = d.gym_id
       WHERE g.name = $1 AND d.resolved_at IS NULL`,
      [gymName],
    );
    assert.equal(rows[0].n, count);
  },
);

Then(
  'the open dispute for gym {string} says {string}',
  async function (this: AuthWorld, gymName: string, detail: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT d.detail
       FROM gym_information_disputes d
       JOIN gyms g ON g.id = d.gym_id
       WHERE g.name = $1 AND d.resolved_at IS NULL`,
      [gymName],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].detail, detail);
  },
);

Then(
  'a gym_verifications row exists for {string} and {string}',
  async function (this: AuthWorld, email: string, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT gv.id
       FROM gym_verifications gv
       JOIN users u ON u.id = gv.verifier_user_id
       JOIN gyms g ON g.id = gv.gym_id
       WHERE u.email = $1 AND g.name = $2`,
      [email, gymName],
    );
    assert.equal(rows.length, 1);
  },
);

Then(
  'no gym_verifications row exists for {string} and {string}',
  async function (this: AuthWorld, email: string, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT gv.id
       FROM gym_verifications gv
       JOIN users u ON u.id = gv.verifier_user_id
       JOIN gyms g ON g.id = gv.gym_id
       WHERE u.email = $1 AND g.name = $2`,
      [email, gymName],
    );
    assert.equal(rows.length, 0);
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
  'gym {string} is still UNVERIFIED',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      'SELECT status FROM gyms WHERE name = $1',
      [gymName],
    );
    assert.equal(rows[0]?.status, 'UNVERIFIED');
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
