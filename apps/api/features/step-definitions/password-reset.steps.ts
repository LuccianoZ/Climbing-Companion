import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { AuthWorld } from '../support/world';

When(
  '{string} requests a password reset',
  async function (this: AuthWorld, email: string) {
    this.response = await this.http
      .post('/api/auth/password-reset/request')
      .send({ email });
  },
);

Then(
  'a password reset email is sent to {string} with a reset link',
  function (this: AuthWorld, email: string) {
    assert.equal(this.response.status, 200, JSON.stringify(this.response.body));

    const sent = this.mail.getSentEmails();
    const match = [...sent].reverse().find((m) => m.to === email);
    assert.ok(match, `expected a password reset email queued for ${email}`);

    const tokenMatch = match!.text.match(/token=([^\s&]+)/);
    assert.ok(
      tokenMatch,
      `expected the email body to contain a reset link with a token, got: ${match!.text}`,
    );
    this.resetToken = tokenMatch![1];
  },
);

When(
  'the reset link is used to set a new password {string}',
  async function (this: AuthWorld, newPassword: string) {
    assert.ok(this.resetToken, 'no reset token captured from a prior step');
    this.response = await this.http
      .post('/api/auth/password-reset/confirm')
      .send({ token: this.resetToken, newPassword });
  },
);

When(
  'the same reset link is used again to set a new password {string}',
  async function (this: AuthWorld, newPassword: string) {
    assert.ok(this.resetToken, 'no reset token captured from a prior step');
    this.response = await this.http
      .post('/api/auth/password-reset/confirm')
      .send({ token: this.resetToken, newPassword });
  },
);

Then('the password reset succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then('the password reset is rejected as unauthorized', function (this: AuthWorld) {
  assert.equal(this.response.status, 401, JSON.stringify(this.response.body));
});

Then(
  '{string} can log in with password {string}',
  async function (this: AuthWorld, email: string, password: string) {
    const res = await this.http.post('/api/auth/login').send({ email, password });
    assert.equal(res.status, 200, `expected login to succeed: ${JSON.stringify(res.body)}`);
  },
);

Then(
  '{string} can no longer log in with password {string}',
  async function (this: AuthWorld, email: string, password: string) {
    const res = await this.http.post('/api/auth/login').send({ email, password });
    assert.equal(res.status, 401, `expected login to be rejected: ${JSON.stringify(res.body)}`);
  },
);
