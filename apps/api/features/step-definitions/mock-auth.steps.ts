import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

When(
  '{string} is authenticated via the X-Test-Mock-Auth bypass header',
  async function (this: AuthWorld, email: string) {
    // No login flow at all -- that's the point of the bypass. Look up the
    // seeded user's id directly so the header has something real to name.
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    assert.ok(rows[0]?.id, `expected a seeded user for ${email}`);

    this.response = await this.http
      .get('/api/auth/me')
      .set('X-Test-Mock-Auth', rows[0].id as string);
  },
);

Then(
  'the bypassed request is authenticated as {string}',
  function (this: AuthWorld, email: string) {
    assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
    assert.equal(this.response.body.email, email);
  },
);
