import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import {
  findUserIdByEmail,
  seedSubmissionPhotoIds,
  SAMPLE_OPERATING_HOURS,
} from '../support/seed';

type Hours = Record<
  string,
  Array<{ opens: string; closes: string; fullDay: boolean }>
>;

function scheduleFor(shape: string): Hours {
  const base: Hours = JSON.parse(JSON.stringify(SAMPLE_OPERATING_HOURS));
  switch (shape) {
    case 'closed-day':
      base['2'] = [];
      return base;
    case 'split-shift':
      base['5'] = [
        { opens: '06:00', closes: '12:00', fullDay: false },
        { opens: '16:00', closes: '22:00', fullDay: false },
      ];
      return base;
    case 'past-midnight':
      base['5'] = [{ opens: '18:00', closes: '02:00', fullDay: false }];
      return base;
    case 'twenty-four-hr':
      base['3'] = [{ opens: '00:00', closes: '00:00', fullDay: true }];
      return base;
    default:
      throw new Error(`unknown schedule shape "${shape}"`);
  }
}

async function fullGymPayload(
  dataSource: DataSource,
  submitterId: string,
): Promise<Record<string, unknown>> {
  return {
    disciplinesOffered: ['TOP_ROPE'],
    operatingHours: SAMPLE_OPERATING_HOURS,
    photoMediaIds: await seedSubmissionPhotoIds(
      dataSource,
      submitterId,
      'GYM_SUBMISSION_PHOTO',
    ),
  };
}

// AR-51 BL-x04/x05: a gym submission now carries disciplines, a full weekly
// hours object and >= 3 photos. These are injected transparently here (a
// default single discipline + SAMPLE_OPERATING_HOURS) so features that only
// need "a gym exists" keep working; the required-data rules are exercised
// explicitly in gym-submission-and-verification.feature.
When(
  '{string} submits a gym named {string} at latitude {float}, longitude {float}',
  async function (
    this: AuthWorld,
    email: string,
    name: string,
    latitude: number,
    longitude: number,
  ) {
    const dataSource = this.app.get(DataSource);
    const submitterId = await findUserIdByEmail(dataSource, email);
    const photoMediaIds = await seedSubmissionPhotoIds(
      dataSource,
      submitterId,
      'GYM_SUBMISSION_PHOTO',
    );

    this.response = await this.http
      .post('/api/gyms')
      .set('Cookie', this.sessionCookie)
      .send({
        name,
        latitude,
        longitude,
        disciplinesOffered: ['TOP_ROPE'],
        operatingHours: SAMPLE_OPERATING_HOURS,
        photoMediaIds,
      });
  },
);

When(
  '{string} submits a gym named {string} at {float}, {float} omitting {word}',
  async function (
    this: AuthWorld,
    email: string,
    name: string,
    latitude: number,
    longitude: number,
    field: string,
  ) {
    const dataSource = this.app.get(DataSource);
    const submitterId = await findUserIdByEmail(dataSource, email);
    const payload = await fullGymPayload(dataSource, submitterId);
    const keyByField: Record<string, string> = {
      disciplines: 'disciplinesOffered',
      hours: 'operatingHours',
      photos: 'photoMediaIds',
    };
    delete payload[keyByField[field] ?? field];

    this.response = await this.http
      .post('/api/gyms')
      .set('Cookie', this.sessionCookie)
      .send({ name, latitude, longitude, ...payload });
  },
);

When(
  '{string} submits a gym named {string} at {float}, {float} with a {word} schedule',
  async function (
    this: AuthWorld,
    email: string,
    name: string,
    latitude: number,
    longitude: number,
    shape: string,
  ) {
    const dataSource = this.app.get(DataSource);
    const submitterId = await findUserIdByEmail(dataSource, email);
    const payload = await fullGymPayload(dataSource, submitterId);
    payload.operatingHours = scheduleFor(shape);

    this.response = await this.http
      .post('/api/gyms')
      .set('Cookie', this.sessionCookie)
      .send({ name, latitude, longitude, ...payload });
  },
);

When(
  '{string} authors a gym named {string} {int} meters from their location with disciplines {string}',
  async function (
    this: AuthWorld,
    email: string,
    name: string,
    meters: number,
    disciplinesRaw: string,
  ) {
    const dataSource = this.app.get(DataSource);
    const adminId = await findUserIdByEmail(dataSource, email);
    const photoMediaIds = await seedSubmissionPhotoIds(
      dataSource,
      adminId,
      'GYM_SUBMISSION_PHOTO',
    );
    // The admin's device location is far from the pin -- irrelevant, since
    // the proximity gate is skipped for SYSTEM_ADMIN (BL-x03).
    const deviceLatitude = 40.0;
    const pinLatitude = deviceLatitude + meters / 111_320;

    this.response = await this.http
      .post('/api/gyms')
      .set('X-Test-Mock-Auth', adminId)
      .send({
        name,
        latitude: pinLatitude,
        longitude: -105.0,
        disciplinesOffered: disciplinesRaw.split(',').map((d) => d.trim()),
        operatingHours: SAMPLE_OPERATING_HOURS,
        photoMediaIds,
      });
  },
);

Then('the gym submission succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then(
  'the gym submission is rejected as a validation error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 400, JSON.stringify(this.response.body));
  },
);

Then(
  'every submission photo for gym {string} is APPROVED',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT m.moderation_status
       FROM media_assets m
       JOIN gyms g ON g.id = m.subject_gym_id
       WHERE g.name = $1`,
      [gymName],
    );
    assert.ok(rows.length >= 3, `expected >= 3 submission photos, got ${rows.length}`);
    assert.ok(
      rows.every((r: { moderation_status: string }) => r.moderation_status === 'APPROVED'),
    );
  },
);

Then(
  'a standalone gym {string} exists with no crag relationship and status UNVERIFIED',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);

    // Structural proof of "no crag relationship" -- the gyms table has no
    // crag_id (or any crag-referencing) column at all.
    const columns = await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'gyms' AND column_name ILIKE '%crag%'`,
    );
    assert.equal(
      columns.length,
      0,
      'expected the gyms table to have no crag-related column',
    );

    // AR-51 BL-x04: disciplines are now set from submission (not the
    // AR-17 verification union), so a fresh gym has >= 1 discipline and a
    // stored IANA timezone.
    const rows = await dataSource.query(
      `SELECT status, cardinality(disciplines_offered) AS discipline_count,
              verified_directly_by_admin, iana_timezone
       FROM gyms WHERE name = $1`,
      [gymName],
    );
    assert.equal(rows.length, 1, `expected exactly one gym named "${gymName}"`);
    assert.equal(rows[0].status, 'UNVERIFIED');
    assert.ok(Number(rows[0].discipline_count) >= 1);
    assert.equal(rows[0].verified_directly_by_admin, false);
    assert.ok(
      typeof rows[0].iana_timezone === 'string' &&
        rows[0].iana_timezone.length > 0,
    );
  },
);
