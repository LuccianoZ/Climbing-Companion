import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { AuthWorld } from '../support/world';

const SESSION_COOKIE_PREFIX = 'session=';

Given(
  'a Verified Climber {string} is already registered with password {string}',
  async function (this: AuthWorld, email: string, password: string) {
    const res = await this.http.post('/api/auth/register').send({
      email,
      password,
      displayName: 'Existing Climber',
    });
    assert.equal(res.status, 201, `seed registration failed: ${JSON.stringify(res.body)}`);
  },
);

When(
  '{string} logs in with password {string}',
  async function (this: AuthWorld, email: string, password: string) {
    this.response = await this.http.post('/api/auth/login').send({ email, password });
  },
);

Then('the login succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then('the login is rejected as unauthorized', function (this: AuthWorld) {
  assert.equal(this.response.status, 401, JSON.stringify(this.response.body));
});

function sessionCookie(response: AuthWorld['response']): string | undefined {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(SESSION_COOKIE_PREFIX));
}

Then(
  'the response sets a session cookie that is HttpOnly, Secure, and SameSite=Strict',
  function (this: AuthWorld) {
    const cookie = sessionCookie(this.response);
    assert.ok(cookie, 'expected a Set-Cookie header starting with "session="');
    assert.match(cookie!, /HttpOnly/i);
    assert.match(cookie!, /Secure/i);
    assert.match(cookie!, /SameSite=Strict/i);
  },
);

Then('no session cookie is set', function (this: AuthWorld) {
  assert.equal(sessionCookie(this.response), undefined);
});
