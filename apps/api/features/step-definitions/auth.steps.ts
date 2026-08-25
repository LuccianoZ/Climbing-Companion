import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

Given(
  'a Verified Climber {string} is already registered',
  async function (this: AuthWorld, email: string) {
    const res = await this.http.post('/api/auth/register').send({
      email,
      password: 'initial seed password',
      displayName: 'Existing Climber',
    });
    assert.equal(res.status, 201, `seed registration failed: ${JSON.stringify(res.body)}`);
  },
);

When(
  'a visitor registers with email {string}, password {string}, and display name {string}',
  async function (this: AuthWorld, email: string, password: string, displayName: string) {
    this.response = await this.http.post('/api/auth/register').send({
      email,
      password,
      displayName,
    });
  },
);

Then('the registration succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then('the registration is rejected as a conflict', function (this: AuthWorld) {
  assert.equal(this.response.status, 409, JSON.stringify(this.response.body));
});

Then(
  'the stored user has role {string}',
  async function (this: AuthWorld, role: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query('SELECT role FROM users WHERE email = $1', [
      this.response.body.email,
    ]);
    assert.equal(rows[0]?.role, role);
  },
);

Then(
  'the stored password hash is an argon2id hash, not the plaintext password',
  async function (this: AuthWorld) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query('SELECT password_hash FROM users WHERE email = $1', [
      this.response.body.email,
    ]);
    const hash = rows[0]?.password_hash as string;
    assert.ok(hash.startsWith('$argon2id$'), `expected an argon2id hash, got: ${hash}`);
  },
);

Then('no second users row is written for {string}', async function (this: AuthWorld, email: string) {
  const dataSource = this.app.get(DataSource);
  const rows = await dataSource.query('SELECT id FROM users WHERE email = $1', [email]);
  assert.equal(rows.length, 1);
});
