import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

When(
  '{string} submits a gym named {string} at latitude {float}, longitude {float}',
  async function (this: AuthWorld, _email: string, name: string, latitude: number, longitude: number) {
    this.response = await this.http
      .post('/api/gyms')
      .set('Cookie', this.sessionCookie)
      .send({ name, latitude, longitude });
  },
);

Then('the gym submission succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then(
  'a standalone gym {string} exists with no crag relationship, status UNVERIFIED, and no disciplines offered yet',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);

    // Structural proof of "no crag relationship" -- the gyms table has no
    // crag_id (or any crag-referencing) column at all, not just a null one.
    const columns = await dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'gyms' AND column_name ILIKE '%crag%'`,
    );
    assert.equal(columns.length, 0, 'expected the gyms table to have no crag-related column');

    // node-postgres has no built-in type parser for a custom ENUM array's
    // OID (unlike scalar enums or built-in array types), so a raw query
    // against `disciplines_offered` comes back as the untouched Postgres
    // array literal text ("{}") rather than a parsed JS array -- cardinality()
    // sidesteps that by comparing server-side instead of client-side.
    const rows = await dataSource.query(
      `SELECT status, cardinality(disciplines_offered) AS discipline_count, verified_directly_by_admin
       FROM gyms WHERE name = $1`,
      [gymName],
    );
    assert.equal(rows.length, 1, `expected exactly one gym named "${gymName}"`);
    assert.equal(rows[0].status, 'UNVERIFIED');
    assert.equal(Number(rows[0].discipline_count), 0);
    assert.equal(rows[0].verified_directly_by_admin, false);
  },
);
