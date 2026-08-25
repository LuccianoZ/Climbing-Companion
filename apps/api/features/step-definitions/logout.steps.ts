import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { AuthWorld } from '../support/world';

const SESSION_COOKIE_PREFIX = 'session=';

function sessionCookie(response: AuthWorld['response']): string | undefined {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(SESSION_COOKIE_PREFIX));
}

Given(
  '{string} is logged in with password {string}',
  async function (this: AuthWorld, email: string, password: string) {
    const res = await this.http.post('/api/auth/login').send({ email, password });
    assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
    const cookie = sessionCookie(res);
    assert.ok(cookie, 'expected login to set a session cookie');
    // Keep only "session=<value>" -- strip Path/Expires/HttpOnly/etc so this
    // can be replayed verbatim as a request's Cookie header later.
    this.sessionCookie = cookie!.split(';')[0];
  },
);

When('{string} logs out', async function (this: AuthWorld, _email: string) {
  this.response = await this.http
    .post('/api/auth/logout')
    .set('Cookie', this.sessionCookie);
});

Then('the logout succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then('the response clears the session cookie', function (this: AuthWorld) {
  const cookie = sessionCookie(this.response);
  assert.ok(cookie, 'expected a Set-Cookie header for the session cookie');
  // res.clearCookie() re-sends the cookie with an empty value and an
  // Expires timestamp in the past -- that combination is what actually
  // tells the browser to delete it, as opposed to just omitting the header
  // (which would leave the browser's existing copy untouched).
  assert.match(cookie!, /^session=;/, `expected an empty cookie value, got: ${cookie}`);
  assert.match(
    cookie!,
    /Expires=Thu, 01 Jan 1970/i,
    `expected a past Expires date clearing the cookie, got: ${cookie}`,
  );
});

Then(
  'an authenticated request with the old session cookie is rejected',
  async function (this: AuthWorld) {
    const res = await this.http.get('/api/auth/me').set('Cookie', this.sessionCookie);
    assert.equal(res.status, 401, JSON.stringify(res.body));
  },
);
