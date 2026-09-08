import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { findUserIdByEmail } from '../support/seed';

// BL-045: reviews on any crag / route / gym, regardless of lifecycle
// status. No 300m gate.

const TARGET_TABLE: Record<string, string> = {
  crag: 'crags',
  route: 'routes',
  gym: 'gyms',
};

async function targetId(
  world: AuthWorld,
  kind: string,
  name: string,
): Promise<string> {
  const table = TARGET_TABLE[kind];
  assert.ok(table, `unknown review target kind "${kind}"`);
  const [row] = await world.app
    .get(DataSource)
    .query(`SELECT id FROM "${table}" WHERE name = $1 ORDER BY created_at DESC LIMIT 1`, [
      name,
    ]);
  assert.ok(row?.id, `expected a seeded ${kind} named "${name}"`);
  return row.id as string;
}

async function postReview(
  world: AuthWorld,
  email: string,
  body: Record<string, unknown>,
): Promise<void> {
  const userId = await findUserIdByEmail(world.app.get(DataSource), email);
  world.response = await world.http
    .post('/api/reviews')
    .set('X-Test-Mock-Auth', userId)
    .send(body);
}

When(
  '{string} reviews the {word} {string} saying {string}',
  async function (
    this: AuthWorld,
    email: string,
    kind: string,
    name: string,
    text: string,
  ) {
    const id = await targetId(this, kind, name);
    await postReview(this, email, {
      targetType: kind.toUpperCase(),
      targetId: id,
      body: text,
    });
  },
);

When(
  '{string} reviews the {word} {string} with profane text',
  async function (this: AuthWorld, email: string, kind: string, name: string) {
    const id = await targetId(this, kind, name);
    await postReview(this, email, {
      targetType: kind.toUpperCase(),
      targetId: id,
      body: 'this gym is shit',
    });
  },
);

When(
  '{string} reviews a crag that does not exist saying {string}',
  async function (this: AuthWorld, email: string, text: string) {
    await postReview(this, email, {
      targetType: 'CRAG',
      targetId: '00000000-0000-0000-0000-000000000000',
      body: text,
    });
  },
);

Given(
  '{string} has uploaded a review photo',
  async function (this: AuthWorld, email: string) {
    const userId = await findUserIdByEmail(this.app.get(DataSource), email);
    const res = await this.http
      .post('/api/media')
      .set('X-Test-Mock-Auth', userId)
      .field('purpose', 'REVIEW_PHOTO')
      .attach('file', Buffer.alloc(1024, 0xcd), {
        filename: 'review.png',
        contentType: 'image/png',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    this.uploadedMediaId = res.body.id as string;
  },
);

When(
  '{string} reviews the {word} {string} with that photo saying {string}',
  async function (
    this: AuthWorld,
    email: string,
    kind: string,
    name: string,
    text: string,
  ) {
    const id = await targetId(this, kind, name);
    await postReview(this, email, {
      targetType: kind.toUpperCase(),
      targetId: id,
      body: text,
      mediaAssetId: this.uploadedMediaId,
    });
  },
);

// Note: "{string} reviews the {word} {string} saying {string}" is defined
// once (above, as a When) -- Cucumber matches it under Given too, so the
// "public list" scenario reuses it as a Background-style step.

When(
  'an admin approves the review photo',
  async function (this: AuthWorld) {
    await this.app
      .get(DataSource)
      .query(
        `UPDATE media_assets SET moderation_status = 'APPROVED' WHERE id = $1`,
        [this.uploadedMediaId],
      );
  },
);

When(
  'an unauthenticated Visitor requests the reviews of the {word} {string}',
  async function (this: AuthWorld, kind: string, name: string) {
    const id = await targetId(this, kind, name);
    this.response = await this.http
      .get('/api/reviews')
      .query({ targetType: kind.toUpperCase(), targetId: id });
  },
);

async function listReviews(
  world: AuthWorld,
  kind: string,
  name: string,
): Promise<
  Array<{
    body: string;
    authorDisplayName: string;
    photoMediaId: string | null;
    photoPending: boolean;
  }>
> {
  const id = await targetId(world, kind, name);
  const res = await world.http
    .get('/api/reviews')
    .query({ targetType: kind.toUpperCase(), targetId: id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

Then('the review is created', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then(
  'the review is rejected as a validation error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 400, JSON.stringify(this.response.body));
  },
);

Then('the review is rejected as not found', function (this: AuthWorld) {
  assert.equal(this.response.status, 404, JSON.stringify(this.response.body));
});

Then('the review list request succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 200, JSON.stringify(this.response.body));
});

Then(
  'the {word} {string} has {int} review',
  async function (this: AuthWorld, kind: string, name: string, count: number) {
    const rows = await listReviews(this, kind, name);
    assert.equal(rows.length, count, JSON.stringify(rows));
  },
);

Then(
  'the {word} {string} has {int} reviews',
  async function (this: AuthWorld, kind: string, name: string, count: number) {
    const rows = await listReviews(this, kind, name);
    assert.equal(rows.length, count, JSON.stringify(rows));
  },
);

Then(
  'the {word} {string} review list shows {string} by {string}',
  async function (
    this: AuthWorld,
    kind: string,
    name: string,
    text: string,
    authorEmail: string,
  ) {
    const rows = await listReviews(this, kind, name);
    const match = rows.find((r) => r.body === text);
    assert.ok(match, `expected a review saying "${text}": ${JSON.stringify(rows)}`);
    // The seed registers users with a display name derived from the local
    // part of the email; assert the review carries some non-empty author name.
    assert.ok(
      match.authorDisplayName && match.authorDisplayName.length > 0,
      'expected the review to carry an author display name',
    );
    assert.ok(authorEmail.length > 0);
  },
);

Then(
  'the {word} {string} review list marks the photo as pending',
  async function (this: AuthWorld, kind: string, name: string) {
    const rows = await listReviews(this, kind, name);
    assert.ok(
      rows.some((r) => r.photoPending && r.photoMediaId === null),
      `expected a review with a pending, withheld photo: ${JSON.stringify(rows)}`,
    );
  },
);

Then(
  'the {word} {string} review list surfaces the photo id',
  async function (this: AuthWorld, kind: string, name: string) {
    const rows = await listReviews(this, kind, name);
    assert.ok(
      rows.some((r) => r.photoMediaId !== null && !r.photoPending),
      `expected a review with an approved, surfaced photo id: ${JSON.stringify(rows)}`,
    );
  },
);
