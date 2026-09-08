import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { findUserIdByEmail } from '../support/seed';

// BL-040/041 (AR-55, Sept 7, 2026 -- Part 2): invite-link friendship. A
// climber mints a single-use link and the first valid redemption makes the
// two friends -- no request, no accept.

async function redeem(
  world: AuthWorld,
  redeemerEmail: string,
  creatorEmail: string,
): Promise<void> {
  const redeemerId = await findUserIdByEmail(
    world.app.get(DataSource),
    redeemerEmail,
  );
  const token = world.inviteTokensByCreator[creatorEmail];
  assert.ok(token, `expected ${creatorEmail} to have created an invite link`);
  world.response = await world.http
    .post(`/api/friend-invite-links/${token}/redeem`)
    .set('X-Test-Mock-Auth', redeemerId);
}

Given(
  '{string} creates a friend invite link',
  async function (this: AuthWorld, email: string) {
    const userId = await findUserIdByEmail(this.app.get(DataSource), email);
    const res = await this.http
      .post('/api/friend-invite-links')
      .set('X-Test-Mock-Auth', userId);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    this.inviteTokensByCreator[email] = res.body.token as string;
  },
);

Given(
  "{string} has already redeemed {string}'s invite link",
  async function (this: AuthWorld, redeemerEmail: string, creatorEmail: string) {
    await redeem(this, redeemerEmail, creatorEmail);
    assert.ok(
      [200, 201].includes(this.response.status),
      `expected the priming redemption to succeed: ${JSON.stringify(this.response.body)}`,
    );
  },
);

Given(
  "{string}'s invite link has expired",
  async function (this: AuthWorld, creatorEmail: string) {
    const token = this.inviteTokensByCreator[creatorEmail];
    assert.ok(token, `expected ${creatorEmail} to have created an invite link`);
    await this.app
      .get(DataSource)
      .query(
        `UPDATE friend_invite_links SET expires_at = now() - interval '1 day' WHERE token = $1`,
        [token],
      );
  },
);

When(
  "{string} redeems {string}'s invite link",
  async function (this: AuthWorld, redeemerEmail: string, creatorEmail: string) {
    await redeem(this, redeemerEmail, creatorEmail);
  },
);

When(
  '{string} unadds {string}',
  async function (this: AuthWorld, actingEmail: string, otherEmail: string) {
    const dataSource = this.app.get(DataSource);
    const actingId = await findUserIdByEmail(dataSource, actingEmail);
    const otherId = await findUserIdByEmail(dataSource, otherEmail);
    const [row] = await dataSource.query(
      `SELECT id FROM friendships
       WHERE status = 'ACTIVE'
         AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
      [actingId, otherId],
    );
    assert.ok(
      row?.id,
      `expected an ACTIVE friendship between ${actingEmail} and ${otherEmail}`,
    );
    this.response = await this.http
      .delete(`/api/friendships/${row.id}`)
      .set('X-Test-Mock-Auth', actingId);
  },
);

// Shared fixture step, also used by gym-badges-and-streaks.feature: makes
// two users ACTIVE friends directly, without minting and redeeming a link.
Given(
  '{string} and {string} are friends',
  async function (this: AuthWorld, emailA: string, emailB: string) {
    const dataSource = this.app.get(DataSource);
    const idA = await findUserIdByEmail(dataSource, emailA);
    const idB = await findUserIdByEmail(dataSource, emailB);
    await dataSource.query(
      `INSERT INTO friendships (requester_id, addressee_id, status, responded_at)
       VALUES ($1, $2, 'ACTIVE', now())`,
      [idA, idB],
    );
  },
);

Then('the invite redemption succeeds', function (this: AuthWorld) {
  assert.ok(
    [200, 201, 204].includes(this.response.status),
    JSON.stringify(this.response.body),
  );
});

Then('the unadd succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 204, JSON.stringify(this.response.body));
});

Then('the invite redemption is rejected as gone', function (this: AuthWorld) {
  assert.equal(this.response.status, 410, JSON.stringify(this.response.body));
});

Then(
  'the invite redemption is rejected as a bad request',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 400, JSON.stringify(this.response.body));
  },
);

Then('the invite link is now consumed', async function (this: AuthWorld) {
  const rows = await this.app
    .get(DataSource)
    .query(
      `SELECT consumed_at FROM friend_invite_links WHERE consumed_at IS NOT NULL`,
    );
  assert.ok(rows.length >= 1, 'expected the invite link to be marked consumed');
});

async function friendshipRows(
  dataSource: DataSource,
  emailA: string,
  emailB: string,
): Promise<Array<{ status: string }>> {
  const idA = await findUserIdByEmail(dataSource, emailA);
  const idB = await findUserIdByEmail(dataSource, emailB);
  return dataSource.query(
    `SELECT status FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [idA, idB],
  );
}

Then(
  'an ACTIVE friendship exists between {string} and {string}',
  async function (this: AuthWorld, emailA: string, emailB: string) {
    const rows = await friendshipRows(this.app.get(DataSource), emailA, emailB);
    assert.equal(rows[0]?.status, 'ACTIVE');
  },
);

Then(
  'exactly one friendship exists between {string} and {string}',
  async function (this: AuthWorld, emailA: string, emailB: string) {
    const rows = await friendshipRows(this.app.get(DataSource), emailA, emailB);
    assert.equal(rows.length, 1, JSON.stringify(rows));
  },
);

Then(
  'no friendship exists between {string} and {string}',
  async function (this: AuthWorld, emailA: string, emailB: string) {
    const rows = await friendshipRows(this.app.get(DataSource), emailA, emailB);
    assert.equal(rows.length, 0);
  },
);

// "{string} has an {word} notification" and "...has no {word}..." are
// shared steps defined in moderation.steps.ts -- reused here for
// FRIEND_ADDED rather than redefined.
