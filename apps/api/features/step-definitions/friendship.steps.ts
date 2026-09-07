import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { findUserIdByEmail } from '../support/seed';

// BL-x11 (AR-53): minimal friendship, pulled forward from Epic 9
// (BL-039/040) because Gym Badge/Streak visibility depends on it.

async function findFriendshipId(
  dataSource: DataSource,
  requesterEmail: string,
  addresseeEmail: string,
): Promise<string> {
  const requesterId = await findUserIdByEmail(dataSource, requesterEmail);
  const addresseeId = await findUserIdByEmail(dataSource, addresseeEmail);
  const [row] = await dataSource.query(
    `SELECT id FROM friendships WHERE requester_id = $1 AND addressee_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [requesterId, addresseeId],
  );
  assert.ok(
    row?.id,
    `expected a friendship request from ${requesterEmail} to ${addresseeEmail}`,
  );
  return row.id as string;
}

When(
  '{string} sends a friend request to {string}',
  async function (this: AuthWorld, fromEmail: string, toEmail: string) {
    const fromId = await findUserIdByEmail(this.app.get(DataSource), fromEmail);
    const toId = await findUserIdByEmail(this.app.get(DataSource), toEmail);
    this.response = await this.http
      .post('/api/friendships')
      .set('X-Test-Mock-Auth', fromId)
      .send({ addresseeId: toId });
  },
);

When(
  '{string} accepts the friend request from {string}',
  async function (this: AuthWorld, actingEmail: string, requesterEmail: string) {
    const dataSource = this.app.get(DataSource);
    const actingId = await findUserIdByEmail(dataSource, actingEmail);
    const friendshipId = await findFriendshipId(dataSource, requesterEmail, actingEmail);
    this.response = await this.http
      .patch(`/api/friendships/${friendshipId}/accept`)
      .set('X-Test-Mock-Auth', actingId);
  },
);

When(
  '{string} tries to accept their own request to {string}',
  async function (this: AuthWorld, requesterEmail: string, addresseeEmail: string) {
    const dataSource = this.app.get(DataSource);
    const requesterId = await findUserIdByEmail(dataSource, requesterEmail);
    const friendshipId = await findFriendshipId(dataSource, requesterEmail, addresseeEmail);
    this.response = await this.http
      .patch(`/api/friendships/${friendshipId}/accept`)
      .set('X-Test-Mock-Auth', requesterId);
  },
);

When(
  '{string} declines the friend request from {string}',
  async function (this: AuthWorld, actingEmail: string, requesterEmail: string) {
    const dataSource = this.app.get(DataSource);
    const actingId = await findUserIdByEmail(dataSource, actingEmail);
    const friendshipId = await findFriendshipId(dataSource, requesterEmail, actingEmail);
    this.response = await this.http
      .delete(`/api/friendships/${friendshipId}`)
      .set('X-Test-Mock-Auth', actingId);
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
    assert.ok(row?.id, `expected an ACTIVE friendship between ${actingEmail} and ${otherEmail}`);
    this.response = await this.http
      .delete(`/api/friendships/${row.id}`)
      .set('X-Test-Mock-Auth', actingId);
  },
);

// Shared fixture step, also used by gym-badges-and-streaks.feature: makes
// two users ACTIVE friends directly, without exercising the request/accept
// round trip that's already covered by this file's own scenarios.
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

Then('the friend request succeeds', function (this: AuthWorld) {
  assert.ok(
    [200, 201, 204].includes(this.response.status),
    JSON.stringify(this.response.body),
  );
});

Then('the friend request is rejected as forbidden', function (this: AuthWorld) {
  assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
});

Then('the friend request is rejected as a conflict', function (this: AuthWorld) {
  assert.equal(this.response.status, 409, JSON.stringify(this.response.body));
});

Then(
  'a PENDING friendship exists between {string} and {string}',
  async function (this: AuthWorld, emailA: string, emailB: string) {
    const dataSource = this.app.get(DataSource);
    const idA = await findUserIdByEmail(dataSource, emailA);
    const idB = await findUserIdByEmail(dataSource, emailB);
    const [row] = await dataSource.query(
      `SELECT status FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [idA, idB],
    );
    assert.equal(row?.status, 'PENDING');
  },
);

Then(
  'an ACTIVE friendship exists between {string} and {string}',
  async function (this: AuthWorld, emailA: string, emailB: string) {
    const dataSource = this.app.get(DataSource);
    const idA = await findUserIdByEmail(dataSource, emailA);
    const idB = await findUserIdByEmail(dataSource, emailB);
    const [row] = await dataSource.query(
      `SELECT status FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [idA, idB],
    );
    assert.equal(row?.status, 'ACTIVE');
  },
);

Then(
  'no friendship exists between {string} and {string}',
  async function (this: AuthWorld, emailA: string, emailB: string) {
    const dataSource = this.app.get(DataSource);
    const idA = await findUserIdByEmail(dataSource, emailA);
    const idB = await findUserIdByEmail(dataSource, emailB);
    const rows = await dataSource.query(
      `SELECT id FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [idA, idB],
    );
    assert.equal(rows.length, 0);
  },
);

Then(
  '{string} has a FRIEND_REQUEST_RECEIVED notification',
  async function (this: AuthWorld, email: string) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const rows = await dataSource.query(
      `SELECT id FROM notifications WHERE recipient_user_id = $1 AND type = 'FRIEND_REQUEST_RECEIVED'`,
      [userId],
    );
    assert.ok(rows.length >= 1, `expected a FRIEND_REQUEST_RECEIVED notification for ${email}`);
  },
);
