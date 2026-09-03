import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';

const SIZE_MULTIPLIERS: Record<string, number> = { KB: 1024, MB: 1024 * 1024 };

function parseSize(spec: string): number {
  const match = /^(\d+)(KB|MB)$/.exec(spec);
  assert.ok(match, `unrecognized size spec "${spec}" -- expected e.g. "10KB" or "6MB"`);
  return Number(match![1]) * SIZE_MULTIPLIERS[match![2]];
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'bin';
}

When(
  '{string} uploads a {string} {string} file for purpose {string}',
  async function (
    this: AuthWorld,
    _email: string,
    sizeSpec: string,
    mimeType: string,
    purpose: string,
  ) {
    // Deterministic filler bytes -- the gateway cares about size/MIME/etag,
    // never about whether the bytes decode as a real image.
    const buffer = Buffer.alloc(parseSize(sizeSpec), 0xaa);
    this.uploadedBuffer = buffer;
    this.response = await this.http
      .post('/api/media')
      .set('Cookie', this.sessionCookie)
      .field('purpose', purpose)
      .attach('file', buffer, { filename: `photo.${extensionFor(mimeType)}`, contentType: mimeType });
  },
);

Then('the upload succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
  this.uploadedMediaId = (this.response.body as { id: string }).id;
});

Then('the upload is rejected as too large', function (this: AuthWorld) {
  assert.equal(this.response.status, 413, JSON.stringify(this.response.body));
});

Then('the upload is rejected as an unsupported media type', function (this: AuthWorld) {
  assert.equal(this.response.status, 415, JSON.stringify(this.response.body));
});

Then('no media_assets row was written', async function (this: AuthWorld) {
  const dataSource = this.app.get(DataSource);
  const rows = await dataSource.query('SELECT count(*)::int AS count FROM media_assets');
  assert.equal(rows[0].count, 0);
});

Then(
  'streaming the uploaded media back returns the same bytes with a matching ETag',
  async function (this: AuthWorld) {
    assert.ok(this.uploadedMediaId, 'expected a prior successful upload step');
    // BL-027 (Epic 6): a PENDING asset is visible only to its owner and
    // admins. The Background logs in "alex@example.com", who is the uploader,
    // so replay that session on the stream request.
    const streamResponse = await this.http
      .get(`/api/media/${this.uploadedMediaId}`)
      .set('Cookie', this.sessionCookie);
    assert.equal(streamResponse.status, 200);
    assert.ok(streamResponse.headers['etag'], 'expected an ETag response header');
    assert.equal(Buffer.compare(streamResponse.body as Buffer, this.uploadedBuffer!), 0);
    this.mediaResponse = streamResponse;
  },
);

When('the uploaded media is streamed back', async function (this: AuthWorld) {
  assert.ok(this.uploadedMediaId, 'expected a prior successful upload step');
  this.mediaResponse = await this.http
    .get(`/api/media/${this.uploadedMediaId}`)
    .set('Cookie', this.sessionCookie);
});

Then('the response Content-Type is {string}, not JSON', function (this: AuthWorld, mimeType: string) {
  assert.ok(this.mediaResponse, 'expected a prior streaming step');
  const contentType = this.mediaResponse!.headers['content-type'] as string;
  assert.ok(
    contentType.startsWith(mimeType),
    `expected Content-Type to start with "${mimeType}", got "${contentType}"`,
  );
  assert.ok(!contentType.includes('json'), `expected Content-Type not to be JSON, got "${contentType}"`);
});

When(
  'the uploaded media is streamed back with If-None-Match set to its own ETag',
  async function (this: AuthWorld) {
    assert.ok(this.uploadedMediaId, 'expected a prior successful upload step');
    const first = await this.http
      .get(`/api/media/${this.uploadedMediaId}`)
      .set('Cookie', this.sessionCookie);
    const etag = first.headers['etag'] as string;
    assert.ok(etag, 'expected the first request to return an ETag');
    this.mediaResponse = await this.http
      .get(`/api/media/${this.uploadedMediaId}`)
      .set('Cookie', this.sessionCookie)
      .set('If-None-Match', etag);
  },
);

Then('the response status is {int}', function (this: AuthWorld, status: number) {
  assert.ok(this.mediaResponse, 'expected a prior streaming step');
  assert.equal(this.mediaResponse!.status, status);
});
