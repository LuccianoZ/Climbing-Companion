import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { findUserIdByEmail, seedSubmissionPhotoIds } from '../support/seed';

// AR-54 (Sept 7, 2026): the original submitter adds more photos to their
// own gym or climb after the fact. The acting climber is authenticated via
// X-Test-Mock-Auth (not a cookie) so this file doesn't have to juggle two
// concurrent logged-in sessions the way route-verification.steps.ts avoids
// the same problem (AR-16).

async function gymId(dataSource: DataSource, name: string): Promise<string> {
  const [row] = await dataSource.query('SELECT id FROM gyms WHERE name = $1', [
    name,
  ]);
  assert.ok(row?.id, `expected a gym named "${name}"`);
  return row.id as string;
}

async function routeId(dataSource: DataSource, name: string): Promise<string> {
  const [row] = await dataSource.query(
    'SELECT id FROM routes WHERE name = $1',
    [name],
  );
  assert.ok(row?.id, `expected a route named "${name}"`);
  return row.id as string;
}

When(
  '{string} adds a photo to gym {string}',
  async function (this: AuthWorld, email: string, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, gymName);
    const [photoId] = await seedSubmissionPhotoIds(
      dataSource,
      userId,
      'GYM_SUBMISSION_PHOTO',
      1,
    );
    this.response = await this.http
      .post(`/api/gyms/${id}/photos`)
      .set('X-Test-Mock-Auth', userId)
      .send({ photoMediaIds: [photoId] });
  },
);

When(
  '{string} adds a photo to route {string}',
  async function (this: AuthWorld, email: string, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const id = await routeId(dataSource, routeName);
    const [photoId] = await seedSubmissionPhotoIds(
      dataSource,
      userId,
      'ROUTE_SUBMISSION_PHOTO',
      1,
    );
    this.response = await this.http
      .post(`/api/routes/${id}/photos`)
      .set('X-Test-Mock-Auth', userId)
      .send({ photoMediaIds: [photoId] });
  },
);

Then('the add-photos request succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then(
  'the add-photos request is rejected as forbidden',
  function (this: AuthWorld) {
    assert.equal(
      this.response.status,
      403,
      JSON.stringify(this.response.body),
    );
  },
);
