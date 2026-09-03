import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import {
  findUserIdByEmail,
  seedSubmissionPhotoIds,
  SAMPLE_OPERATING_HOURS,
} from '../support/seed';

// The submitter's device location under test (X-Test-Mock-GPS). Somewhere
// far from every other feature's fixture coordinates so a stray match is
// impossible.
const DEVICE = { lat: 40.0, lng: -105.0 };

// Project the pin an exact geodesic distance due north of DEVICE with
// PostGIS -- the same technique the verification steps use, so the 299/301m
// boundary is real to the metre.
async function pinAt(
  dataSource: DataSource,
  meters: number,
): Promise<{ lat: number; lng: number }> {
  const [row] = await dataSource.query(
    `SELECT ST_Y(pt::geometry) AS lat, ST_X(pt::geometry) AS lng
     FROM (SELECT ST_Project(
       ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography,
       $3::float8, radians(0)) AS pt) t`,
    [DEVICE.lng, DEVICE.lat, meters],
  );
  return { lat: Number(row.lat), lng: Number(row.lng) };
}

When(
  '{string} submits a route {int} meters from their location',
  async function (this: AuthWorld, email: string, meters: number) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const pin = await pinAt(dataSource, meters);
    const photoMediaIds = await seedSubmissionPhotoIds(
      dataSource,
      userId,
      'ROUTE_SUBMISSION_PHOTO',
    );

    this.response = await this.http
      .post('/api/routes')
      .set('X-Test-Mock-Auth', userId)
      .set('X-Test-Mock-GPS', `${DEVICE.lat},${DEVICE.lng}`)
      .send({
        name: `Proximity Route ${meters}m`,
        latitude: pin.lat,
        longitude: pin.lng,
        discipline: 'SPORT_CLIMBING',
        summary: 'A route for the proximity boundary test.',
        proposedGradeOrdinal: 10,
        photoMediaIds,
      });
  },
);

When(
  '{string} submits a gym {int} meters from their location',
  async function (this: AuthWorld, email: string, meters: number) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const pin = await pinAt(dataSource, meters);
    const photoMediaIds = await seedSubmissionPhotoIds(
      dataSource,
      userId,
      'GYM_SUBMISSION_PHOTO',
    );

    this.response = await this.http
      .post('/api/gyms')
      .set('X-Test-Mock-Auth', userId)
      .set('X-Test-Mock-GPS', `${DEVICE.lat},${DEVICE.lng}`)
      .send({
        name: `Proximity Gym ${meters}m`,
        latitude: pin.lat,
        longitude: pin.lng,
        disciplinesOffered: ['BOULDERING'],
        operatingHours: SAMPLE_OPERATING_HOURS,
        photoMediaIds,
      });
  },
);

Then('the proximity submission succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then(
  'the proximity submission is rejected with a proximity error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
  },
);

Then(
  'no route was created by that submission',
  async function (this: AuthWorld) {
    const dataSource = this.app.get(DataSource);
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS n FROM routes WHERE name LIKE 'Proximity Route %'`,
    );
    assert.equal(row.n, 0);
  },
);

Then('no gym was created by that submission', async function (this: AuthWorld) {
  const dataSource = this.app.get(DataSource);
  const [row] = await dataSource.query(
    `SELECT count(*)::int AS n FROM gyms WHERE name LIKE 'Proximity Gym %'`,
  );
  assert.equal(row.n, 0);
});
