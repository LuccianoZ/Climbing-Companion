import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { findUserIdByEmail } from '../support/seed';

// BL-036/037: reads GET /api/users/:userId/outdoor-analytics fresh for each
// assertion rather than caching one response on the world -- every step
// below is read-only and the suite is small enough that re-fetching keeps
// each assertion self-contained.

interface GradePoint {
  gradeOrdinal: number;
  completed: number;
  attempted: number;
}

interface DisciplineAnalytics {
  completed: number;
  attempted: number;
  completionRate: number;
  gradeDistribution: GradePoint[];
}

async function fetchAnalytics(
  world: AuthWorld,
  email: string,
): Promise<Record<string, DisciplineAnalytics>> {
  const dataSource = world.app.get(DataSource);
  const userId = await findUserIdByEmail(dataSource, email);
  const res = await world.http
    .get(`/api/users/${userId}/outdoor-analytics`)
    .set('X-Test-Mock-Auth', userId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as Record<string, DisciplineAnalytics>;
}

Then(
  '{string}\'s outdoor analytics for {word} shows {int} completed and {int} attempted',
  async function (
    this: AuthWorld,
    email: string,
    discipline: string,
    completed: number,
    attempted: number,
  ) {
    const analytics = await fetchAnalytics(this, email);
    const bucket = analytics[discipline];
    assert.ok(bucket, `expected an analytics bucket for ${discipline}`);
    assert.equal(bucket.completed, completed);
    assert.equal(bucket.attempted, attempted);
  },
);

Then(
  '{string}\'s outdoor analytics for {word} shows a completion rate of {float}',
  async function (this: AuthWorld, email: string, discipline: string, rate: number) {
    const analytics = await fetchAnalytics(this, email);
    assert.equal(analytics[discipline]?.completionRate, rate);
  },
);

Then(
  '{string}\'s outdoor analytics for {word} grade distribution at grade {int} shows {int} completed and {int} attempted',
  async function (
    this: AuthWorld,
    email: string,
    discipline: string,
    gradeOrdinal: number,
    completed: number,
    attempted: number,
  ) {
    const analytics = await fetchAnalytics(this, email);
    const point = analytics[discipline]?.gradeDistribution.find(
      (p) => p.gradeOrdinal === gradeOrdinal,
    );
    assert.ok(point, `expected a grade-distribution point at ordinal ${gradeOrdinal}`);
    assert.equal(point.completed, completed);
    assert.equal(point.attempted, attempted);
  },
);
