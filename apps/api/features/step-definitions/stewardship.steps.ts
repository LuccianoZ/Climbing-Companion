import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import {
  findUserIdByEmail,
  seedSubmissionPhotoIds,
  SAMPLE_OPERATING_HOURS,
} from '../support/seed';

async function gymId(dataSource: DataSource, name: string): Promise<string> {
  const [row] = await dataSource.query('SELECT id FROM gyms WHERE name = $1', [
    name,
  ]);
  assert.ok(row?.id, `expected a gym named "${name}"`);
  return row.id as string;
}

async function routeId(dataSource: DataSource, name: string): Promise<string> {
  const [row] = await dataSource.query('SELECT id FROM routes WHERE name = $1', [
    name,
  ]);
  assert.ok(row?.id, `expected a route named "${name}"`);
  return row.id as string;
}

async function uploadAdminGymPhoto(
  world: AuthWorld,
  adminId: string,
): Promise<string> {
  const res = await world.http
    .post('/api/media')
    .set('X-Test-Mock-Auth', adminId)
    .field('purpose', 'GYM_SUBMISSION_PHOTO')
    .attach('file', Buffer.alloc(512, 0xcc), {
      filename: 'new.jpg',
      contentType: 'image/jpeg',
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as string;
}

// --- BL-x03: admin authoring -------------------------------------------------

When(
  '{string} authors a route named {string} far from their location',
  async function (this: AuthWorld, email: string, name: string) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const photoMediaIds = await seedSubmissionPhotoIds(
      dataSource,
      adminId,
      'ROUTE_SUBMISSION_PHOTO',
    );

    this.response = await this.http
      .post('/api/routes')
      .set('X-Test-Mock-Auth', adminId)
      .set('X-Test-Mock-GPS', '0,0')
      .send({
        name,
        latitude: 51.5,
        longitude: -0.12,
        discipline: 'SPORT_CLIMBING',
        summary: 'An admin-authored climb, verified on creation.',
        proposedGradeOrdinal: 14,
        photoMediaIds,
      });
  },
);

Then('route {string} is VERIFIED', async function (this: AuthWorld, name: string) {
  const dataSource = this.app.get(DataSource);
  const [row] = await dataSource.query(
    'SELECT status FROM routes WHERE name = $1',
    [name],
  );
  assert.equal(row?.status, 'VERIFIED');
});

Then(
  'the crag founded by {string} is VERIFIED',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const [row] = await dataSource.query(
      `SELECT c.status FROM crags c
       JOIN routes r ON r.id = c.founding_route_id
       WHERE r.name = $1`,
      [routeName],
    );
    assert.equal(row?.status, 'VERIFIED');
  },
);

Then(
  'every submission photo for route {string} is APPROVED',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT m.moderation_status FROM media_assets m
       JOIN routes r ON r.id = m.subject_route_id
       WHERE r.name = $1`,
      [routeName],
    );
    assert.ok(rows.length >= 3);
    assert.ok(
      rows.every(
        (r: { moderation_status: string }) => r.moderation_status === 'APPROVED',
      ),
    );
  },
);

// --- BL-x07: edit -----------------------------------------------------------

When(
  '{string} edits gym {string} setting name to {string} and disciplines {string}',
  async function (
    this: AuthWorld,
    email: string,
    name: string,
    newName: string,
    disciplinesRaw: string,
  ) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, name);
    this.response = await this.http
      .patch(`/api/gyms/${id}`)
      .set('X-Test-Mock-Auth', adminId)
      .send({
        name: newName,
        disciplinesOffered: disciplinesRaw.split(',').map((d) => d.trim()),
      });
  },
);

When(
  '{string} replaces one photo on gym {string} with a fresh upload',
  async function (this: AuthWorld, email: string, name: string) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, name);

    const current = await dataSource.query(
      `SELECT id FROM media_assets WHERE subject_gym_id = $1::uuid ORDER BY id ASC`,
      [id],
    );
    assert.ok(current.length >= 3);
    const kept = current.slice(0, 2).map((r: { id: string }) => r.id);
    const fresh = await uploadAdminGymPhoto(this, adminId);

    this.response = await this.http
      .patch(`/api/gyms/${id}`)
      .set('X-Test-Mock-Auth', adminId)
      .send({ photoMediaIds: [...kept, fresh] });
  },
);

When(
  '{string} tries to leave gym {string} with only 2 photos',
  async function (this: AuthWorld, email: string, name: string) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, name);
    const current = await dataSource.query(
      `SELECT id FROM media_assets WHERE subject_gym_id = $1::uuid ORDER BY id ASC`,
      [id],
    );
    this.response = await this.http
      .patch(`/api/gyms/${id}`)
      .set('X-Test-Mock-Auth', adminId)
      .send({
        photoMediaIds: current.slice(0, 2).map((r: { id: string }) => r.id),
      });
  },
);

Then('the admin edit succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then(
  'the admin edit is rejected as a validation error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 400, JSON.stringify(this.response.body));
  },
);

Then(
  'gym {string} has {int} submission photos',
  async function (this: AuthWorld, name: string, count: number) {
    const dataSource = this.app.get(DataSource);
    const id = await gymId(dataSource, name);
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS n FROM media_assets WHERE subject_gym_id = $1::uuid`,
      [id],
    );
    assert.equal(row.n, count);
  },
);

// --- BL-x07: archive / restore / delete -----------------------------------

When(
  '{string} force-archives gym {string}',
  async function (this: AuthWorld, email: string, name: string) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, name);
    this.response = await this.http
      .post(`/api/gyms/${id}/force-archive`)
      .set('X-Test-Mock-Auth', adminId);
  },
);

When(
  '{string} restores gym {string}',
  async function (this: AuthWorld, email: string, name: string) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, name);
    this.response = await this.http
      .post(`/api/gyms/${id}/restore`)
      .set('X-Test-Mock-Auth', adminId);
  },
);

When(
  '{string} permanently deletes gym {string}',
  async function (this: AuthWorld, email: string, name: string) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, name);
    this.response = await this.http
      .delete(`/api/gyms/${id}`)
      .set('X-Test-Mock-Auth', adminId);
  },
);

When(
  '{string} permanently deletes route {string}',
  async function (this: AuthWorld, email: string, name: string) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const id = await routeId(dataSource, name);
    this.response = await this.http
      .delete(`/api/routes/${id}`)
      .set('X-Test-Mock-Auth', adminId);
  },
);

When(
  '{string} tries to permanently delete gym {string}',
  async function (this: AuthWorld, email: string, name: string) {
    const dataSource = this.app.get(DataSource);
    const nonAdminId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, name);
    this.response = await this.http
      .delete(`/api/gyms/${id}`)
      .set('X-Test-Mock-Auth', nonAdminId);
  },
);

Then(
  'gym {string} status is {word}',
  async function (this: AuthWorld, name: string, status: string) {
    const dataSource = this.app.get(DataSource);
    const [row] = await dataSource.query(
      'SELECT status FROM gyms WHERE name = $1',
      [name],
    );
    assert.equal(row?.status, status);
  },
);

Then(
  'the admin editor still shows gym {string}',
  async function (this: AuthWorld, name: string) {
    const dataSource = this.app.get(DataSource);
    const adminId = await dataSource
      .query(`SELECT id FROM users WHERE role = 'SYSTEM_ADMIN' LIMIT 1`)
      .then((r) => r[0].id as string);
    const id = await gymId(dataSource, name);
    const res = await this.http
      .get(`/api/gyms/${id}`)
      .set('X-Test-Mock-Auth', adminId);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((res.body as { name: string }).name, name);
  },
);

Then('the admin delete succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then('the admin delete is rejected as forbidden', function (this: AuthWorld) {
  assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
});

Then('no gym named {string} exists', async function (this: AuthWorld, name: string) {
  const dataSource = this.app.get(DataSource);
  const [row] = await dataSource.query(
    'SELECT count(*)::int AS n FROM gyms WHERE name = $1',
    [name],
  );
  assert.equal(row.n, 0);
});

Then(
  'route {string} no longer exists',
  async function (this: AuthWorld, name: string) {
    const dataSource = this.app.get(DataSource);
    const [row] = await dataSource.query(
      'SELECT count(*)::int AS n FROM routes WHERE name = $1',
      [name],
    );
    assert.equal(row.n, 0);
  },
);

Then(
  'the crag founded by {string} no longer exists',
  async function (this: AuthWorld, name: string) {
    const dataSource = this.app.get(DataSource);
    const [row] = await dataSource.query(
      'SELECT count(*)::int AS n FROM crags WHERE name = $1',
      [name],
    );
    assert.equal(row.n, 0);
  },
);
