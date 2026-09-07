import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { findUserIdByEmail } from '../support/seed';

// AR-53 (BL-x09/x10): Gym Badges & Gym Streaks. Same locally-duplicated
// gymId() shape as gym-checkin.steps.ts / stewardship.steps.ts.

async function gymId(dataSource: DataSource, name: string): Promise<string> {
  const [row] = await dataSource.query('SELECT id FROM gyms WHERE name = $1', [
    name,
  ]);
  assert.ok(row?.id, `expected a gym named "${name}"`);
  return row.id as string;
}

// Mirrors GymStreaksService.periodOf (year * 12 + 1-indexed month) so
// fixture rows line up exactly with what the service under test computes.
function periodOf(date: Date): number {
  return date.getUTCFullYear() * 12 + (date.getUTCMonth() + 1);
}

Given(
  '{string} has a streak of {int} at {string} last counted last month',
  async function (this: AuthWorld, email: string, streak: number, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, gymName);
    const lastMonthPeriod = periodOf(new Date()) - 1;
    await dataSource.query(
      `INSERT INTO gym_streaks (user_id, gym_id, current_streak_months, last_counted_period)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, gym_id) DO UPDATE SET current_streak_months = $3, last_counted_period = $4`,
      [userId, id, streak, lastMonthPeriod],
    );
  },
);

Given(
  '{string} has a streak of {int} at {string} last counted {int} months ago',
  async function (
    this: AuthWorld,
    email: string,
    streak: number,
    gymName: string,
    monthsAgo: number,
  ) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, gymName);
    const period = periodOf(new Date()) - monthsAgo;
    await dataSource.query(
      `INSERT INTO gym_streaks (user_id, gym_id, current_streak_months, last_counted_period)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, gym_id) DO UPDATE SET current_streak_months = $3, last_counted_period = $4`,
      [userId, id, streak, period],
    );
  },
);

Given(
  '{string} sets badges_public to {word}',
  async function (this: AuthWorld, email: string, value: string) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const res = await this.http
      .patch('/api/users/me/badges-public')
      .set('X-Test-Mock-Auth', userId)
      .send({ badgesPublic: value === 'true' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  },
);

When(
  '{string} views {string}\'s gym activity',
  async function (this: AuthWorld, viewerEmail: string, ownerEmail: string) {
    const dataSource = this.app.get(DataSource);
    const viewerId = await findUserIdByEmail(dataSource, viewerEmail);
    const ownerId = await findUserIdByEmail(dataSource, ownerEmail);
    this.response = await this.http
      .get(`/api/users/${ownerId}/gym-activity`)
      .set('X-Test-Mock-Auth', viewerId);
  },
);

Then(
  'a gym_badges row exists for {string} and {string} with initials {string}',
  async function (this: AuthWorld, email: string, gymName: string, initials: string) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const rows = await dataSource.query(
      `SELECT gb.gym_initials_snapshot FROM gym_badges gb
       JOIN gyms g ON g.id = gb.gym_id
       WHERE gb.user_id = $1 AND g.name = $2`,
      [userId, gymName],
    );
    assert.equal(rows.length, 1, `expected exactly one badge for ${email}/${gymName}`);
    assert.equal(rows[0].gym_initials_snapshot, initials);
  },
);

Then(
  '{int} gym_badges row exists for {string} and {string}',
  async function (this: AuthWorld, count: number, email: string, gymName: string) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const rows = await dataSource.query(
      `SELECT gb.id FROM gym_badges gb
       JOIN gyms g ON g.id = gb.gym_id
       WHERE gb.user_id = $1 AND g.name = $2`,
      [userId, gymName],
    );
    assert.equal(rows.length, count);
  },
);

Then(
  'the badge snapshot for {string} still shows {string} initials {string}',
  async function (this: AuthWorld, email: string, gymName: string, initials: string) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const [row] = await dataSource.query(
      `SELECT gym_id, gym_name_snapshot, gym_initials_snapshot FROM gym_badges WHERE user_id = $1`,
      [userId],
    );
    assert.ok(row, `expected a surviving badge for ${email}`);
    assert.equal(row.gym_id, null, 'expected gym_id to be nulled by the hard delete');
    assert.equal(row.gym_name_snapshot, gymName);
    assert.equal(row.gym_initials_snapshot, initials);
  },
);

Then(
  'the streak for {string} at {string} is {int}',
  async function (this: AuthWorld, email: string, gymName: string, expected: number) {
    const dataSource = this.app.get(DataSource);
    const userId = await findUserIdByEmail(dataSource, email);
    const id = await gymId(dataSource, gymName);
    const [row] = await dataSource.query(
      `SELECT current_streak_months FROM gym_streaks WHERE user_id = $1 AND gym_id = $2`,
      [userId, id],
    );
    assert.ok(row, `expected a gym_streaks row for ${email}/${gymName}`);
    assert.equal(row.current_streak_months, expected);
  },
);

Then(
  'the returned badge list for {string} is empty',
  function (this: AuthWorld, gymName: string) {
    const badges = (this.response.body as { badges: { gymNameSnapshot: string }[] }).badges;
    assert.equal(badges.filter((b) => b.gymNameSnapshot === gymName).length, 0);
  },
);

Then(
  'the returned badge list for {string} is not empty',
  function (this: AuthWorld, gymName: string) {
    const badges = (this.response.body as { badges: { gymNameSnapshot: string }[] }).badges;
    assert.ok(badges.filter((b) => b.gymNameSnapshot === gymName).length > 0);
  },
);

Then('the returned streak list is empty', function (this: AuthWorld) {
  const streaks = (this.response.body as { streaks: unknown[] }).streaks;
  assert.equal(streaks.length, 0);
});

Then('the returned streak list is not empty', function (this: AuthWorld) {
  const streaks = (this.response.body as { streaks: unknown[] }).streaks;
  assert.ok(streaks.length > 0);
});
