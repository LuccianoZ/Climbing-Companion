import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { MailService } from '../../src/mail/mail.service';

// Epic 6 (BL-026-030). Actors act via X-Test-Mock-Auth, same as
// route-verification.feature (AR-16): every scenario needs an uploader, an
// admin, and often a viewer authenticated at once, and AuthWorld tracks
// only one session cookie.

async function findUserId(ds: DataSource, email: string): Promise<string> {
  const [row] = await ds.query('SELECT id FROM users WHERE email = $1', [
    email,
  ]);
  assert.ok(row?.id, `expected a registered user ${email}`);
  return row.id as string;
}

async function registerIfAbsent(
  world: AuthWorld,
  email: string,
  displayName: string,
): Promise<void> {
  const ds = world.app.get(DataSource);
  const [existing] = await ds.query('SELECT id FROM users WHERE email = $1', [
    email,
  ]);
  if (existing) return;
  const res = await world.http.post('/api/auth/register').send({
    email,
    password: 'correct horse battery staple',
    displayName,
  });
  assert.equal(
    res.status,
    201,
    `registration failed: ${JSON.stringify(res.body)}`,
  );
}

// Uploads one photo for `email` via the mock-auth bypass and records its id
// on the world. `purpose` is a raw media_purpose value.
async function uploadPhoto(
  world: AuthWorld,
  email: string,
  purpose: string,
): Promise<string> {
  const ds = world.app.get(DataSource);
  const userId = await findUserId(ds, email);
  const res = await world.http
    .post('/api/media')
    .set('X-Test-Mock-Auth', userId)
    .field('purpose', purpose)
    .attach('file', Buffer.alloc(2048, 0xaa), {
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
    });
  assert.equal(res.status, 201, `upload failed: ${JSON.stringify(res.body)}`);
  world.lastMediaAssetId = (res.body as { id: string }).id;
  world.lastUploaderEmail = email;
  return world.lastMediaAssetId;
}

async function moderate(
  world: AuthWorld,
  body: Record<string, unknown>,
): Promise<void> {
  const ds = world.app.get(DataSource);
  const adminId = await findUserId(ds, 'admin@example.com');
  assert.ok(world.lastMediaAssetId, 'expected a prior uploaded photo');
  world.response = await world.http
    .post(`/api/admin/media/${world.lastMediaAssetId}/moderate`)
    .set('X-Test-Mock-Auth', adminId)
    .send(body);
}

function mail(world: AuthWorld): MailService {
  return world.app.get(MailService);
}

// --- profanity (BL-026) -------------------------------------------------

Then(
  'no route named {string} exists',
  async function (this: AuthWorld, name: string) {
    const ds = this.app.get(DataSource);
    const rows = await ds.query('SELECT id FROM routes WHERE name = $1', [
      name,
    ]);
    assert.equal(rows.length, 0, `expected no route named "${name}"`);
  },
);

// --- uploads & visibility (BL-027) ------------------------------------

Given(
  '{string} has uploaded a {string} photo',
  async function (this: AuthWorld, email: string, purpose: string) {
    await uploadPhoto(this, email, purpose);
  },
);

Given(
  '{string} already has {int} strikes',
  async function (this: AuthWorld, email: string, strikes: number) {
    const ds = this.app.get(DataSource);
    await ds.query('UPDATE users SET strike_count = $2 WHERE email = $1', [
      email,
      strikes,
    ]);
  },
);

Given(
  '{string} has been banned by an admin',
  async function (this: AuthWorld, email: string) {
    const ds = this.app.get(DataSource);
    await ds.query(
      'UPDATE users SET is_banned = true, banned_at = now() WHERE email = $1',
      [email],
    );
  },
);

When(
  '{string} streams the uploaded photo',
  async function (this: AuthWorld, email: string) {
    const ds = this.app.get(DataSource);
    const userId = await findUserId(ds, email);
    assert.ok(this.lastMediaAssetId, 'expected a prior uploaded photo');
    this.mediaResponse = await this.http
      .get(`/api/media/${this.lastMediaAssetId}`)
      .set('X-Test-Mock-Auth', userId);
  },
);

When(
  'an anonymous visitor streams the uploaded photo',
  async function (this: AuthWorld) {
    assert.ok(this.lastMediaAssetId, 'expected a prior uploaded photo');
    this.mediaResponse = await this.http.get(
      `/api/media/${this.lastMediaAssetId}`,
    );
  },
);

Then('the photo stream succeeds', function (this: AuthWorld) {
  assert.ok(this.mediaResponse, 'expected a prior stream request');
  assert.equal(
    this.mediaResponse.status,
    200,
    `expected 200, got ${this.mediaResponse.status}`,
  );
});

Then('the photo stream is not found', function (this: AuthWorld) {
  assert.ok(this.mediaResponse, 'expected a prior stream request');
  assert.equal(
    this.mediaResponse.status,
    404,
    `expected 404, got ${this.mediaResponse.status}`,
  );
});

// --- admin decisions (BL-028) ---------------------------------------

When(
  '{string} approves the uploaded photo',
  async function (this: AuthWorld, _admin: string) {
    await moderate(this, { decision: 'APPROVE' });
    assert.equal(
      this.response.status,
      200,
      `approve failed: ${JSON.stringify(this.response.body)}`,
    );
  },
);

When(
  '{string} rejects the uploaded photo with preset {string}',
  async function (this: AuthWorld, _admin: string, preset: string) {
    await moderate(this, { decision: 'REJECT', reasonPreset: preset });
  },
);

When(
  '{string} rejects the uploaded photo with preset {string} and bans the uploader',
  async function (this: AuthWorld, _admin: string, preset: string) {
    await moderate(this, {
      decision: 'REJECT',
      reasonPreset: preset,
      pairedAction: 'BAN_OUTRIGHT',
    });
  },
);

When(
  '{string} rejects the uploaded photo with preset {string} and issues a strike',
  async function (this: AuthWorld, _admin: string, preset: string) {
    await moderate(this, {
      decision: 'REJECT',
      reasonPreset: preset,
      pairedAction: 'ISSUE_STRIKE',
    });
  },
);

When(
  '{string} rejects the uploaded photo and issues a strike with no reason',
  async function (this: AuthWorld, _admin: string) {
    await moderate(this, {
      decision: 'REJECT',
      pairedAction: 'ISSUE_STRIKE',
    });
  },
);

When(
  '{string} rejects the uploaded photo with a 501-character reason',
  async function (this: AuthWorld, _admin: string) {
    await moderate(this, {
      decision: 'REJECT',
      reasonText: 'x'.repeat(501),
    });
  },
);

Then(
  'the moderation decision is rejected as a validation error',
  function (this: AuthWorld) {
    assert.equal(this.response.status, 400, JSON.stringify(this.response.body));
  },
);

Then(
  'the uploaded photo is {word}',
  async function (this: AuthWorld, status: string) {
    const ds = this.app.get(DataSource);
    const [row] = await ds.query(
      'SELECT moderation_status FROM media_assets WHERE id = $1',
      [this.lastMediaAssetId],
    );
    assert.ok(row, 'expected the uploaded media asset to exist');
    assert.equal(row.moderation_status, status);
  },
);

Then(
  '{string} has {int} strike(s)',
  async function (this: AuthWorld, email: string, count: number) {
    const ds = this.app.get(DataSource);
    const [row] = await ds.query(
      'SELECT strike_count FROM users WHERE email = $1',
      [email],
    );
    assert.equal(Number(row.strike_count), count);
  },
);

Then('{string} is banned', async function (this: AuthWorld, email: string) {
  const ds = this.app.get(DataSource);
  const [row] = await ds.query('SELECT is_banned FROM users WHERE email = $1', [
    email,
  ]);
  assert.equal(row.is_banned, true);
});

Then('{string} is not banned', async function (this: AuthWorld, email: string) {
  const ds = this.app.get(DataSource);
  const [row] = await ds.query('SELECT is_banned FROM users WHERE email = $1', [
    email,
  ]);
  assert.equal(row.is_banned, false);
});

Then(
  '{string} has an {word} notification',
  async function (this: AuthWorld, email: string, type: string) {
    const ds = this.app.get(DataSource);
    const rows = await ds.query(
      `SELECT n.id FROM notifications n JOIN users u ON u.id = n.recipient_user_id
       WHERE u.email = $1 AND n.type = $2`,
      [email, type],
    );
    assert.ok(
      rows.length >= 1,
      `expected an ${type} notification for ${email}`,
    );
  },
);

Then(
  '{string} has no {word} notification',
  async function (this: AuthWorld, email: string, type: string) {
    const ds = this.app.get(DataSource);
    const rows = await ds.query(
      `SELECT n.id FROM notifications n JOIN users u ON u.id = n.recipient_user_id
       WHERE u.email = $1 AND n.type = $2`,
      [email, type],
    );
    assert.equal(
      rows.length,
      0,
      `expected no ${type} notification for ${email}`,
    );
  },
);

Then(
  '{string} received an {word} email',
  function (this: AuthWorld, email: string, kind: string) {
    const subjectHint: Record<string, string> = {
      IMAGE_REJECTED: 'photo',
      STRIKE_ISSUED: 'strike',
      ACCOUNT_BANNED: 'suspended',
    };
    const sent = mail(this)
      .getSentEmails()
      .filter((e) => e.to === email);
    assert.ok(
      sent.some((e) => e.subject.toLowerCase().includes(subjectHint[kind])),
      `expected a ${kind} email to ${email}, got ${JSON.stringify(sent)}`,
    );
  },
);

// --- verification-photo rejection (BL-029) --------------------------

Given(
  '{string} is the founding route of a crag verified by 4 photo verifications',
  async function (this: AuthWorld, routeName: string) {
    const ds = this.app.get(DataSource);
    await registerIfAbsent(this, 'route-owner@example.com', 'Route Owner');
    const ownerId = await findUserId(ds, 'route-owner@example.com');

    const [crag] = await ds.query(
      `INSERT INTO crags (name, location, status, created_by)
       VALUES ($1, ST_SetSRID(ST_MakePoint(-78.8784, 42.8864), 4326)::geography, 'VERIFIED', $2)
       RETURNING id`,
      [routeName, ownerId],
    );
    const [route] = await ds.query(
      `INSERT INTO routes (crag_id, name, location, discipline, summary, proposed_grade_ordinal, submitted_by, status, verified_at)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint(-78.8784, 42.8864), 4326)::geography, 'SPORT_CLIMBING', 'Seeded founding route.', 10, $3, 'VERIFIED', now())
       RETURNING id`,
      [crag.id, routeName, ownerId],
    );
    await ds.query(`UPDATE crags SET founding_route_id = $1 WHERE id = $2`, [
      route.id,
      crag.id,
    ]);

    for (let i = 0; i < 4; i++) {
      const email = `seed-verifier-${i}@example.com`;
      await registerIfAbsent(this, email, 'Seed Verifier');
      const uid = await findUserId(ds, email);
      // PENDING, not APPROVED: a verification counts immediately, but its
      // photo only becomes publicly visible after admin approval (Foundation
      // §5). The scenario rejects one of these from the flag queue.
      const [media] = await ds.query(
        `INSERT INTO media_assets (owner_user_id, purpose, payload, mime_type, byte_size, etag)
         VALUES ($1, 'ROUTE_VERIFICATION_PHOTO', $2, 'image/jpeg', 3, $3)
         RETURNING id`,
        [uid, Buffer.from([1, 2, 3]), `seed-etag-${i}`],
      );
      await ds.query(
        `INSERT INTO route_verifications (route_id, verifier_user_id, media_asset_id)
         VALUES ($1, $2, $3)`,
        [route.id, uid, media.id],
      );
      await ds.query(
        `INSERT INTO route_grade_votes (route_id, voter_user_id, grade_ordinal)
         VALUES ($1, $2, 10) ON CONFLICT DO NOTHING`,
        [route.id, uid],
      );
      if (i === 0) {
        this.lastMediaAssetId = media.id as string;
        this.voidVerifierEmail = email;
      }
    }
  },
);

When(
  '{string} rejects a verification photo for {string}',
  async function (this: AuthWorld, _admin: string, _routeName: string) {
    await moderate(this, {
      decision: 'REJECT',
      reasonPreset: 'SUSPECTED_FRAUDULENT',
    });
    assert.equal(
      this.response.status,
      200,
      `reject failed: ${JSON.stringify(this.response.body)}`,
    );
  },
);

Then(
  'the verifier who uploaded it has {int} strike',
  async function (this: AuthWorld, count: number) {
    const ds = this.app.get(DataSource);
    const [row] = await ds.query(
      'SELECT strike_count FROM users WHERE email = $1',
      [this.voidVerifierEmail],
    );
    assert.equal(Number(row.strike_count), count);
  },
);

Then(
  'the verifier who uploaded it received a STRIKE_ISSUED email',
  function (this: AuthWorld) {
    const sent = mail(this)
      .getSentEmails()
      .filter((e) => e.to === this.voidVerifierEmail);
    assert.ok(
      sent.some((e) => e.subject.toLowerCase().includes('strike')),
      `expected a strike email to ${this.voidVerifierEmail}`,
    );
  },
);

Then(
  '{string} reverts to UNVERIFIED',
  async function (this: AuthWorld, routeName: string) {
    const ds = this.app.get(DataSource);
    const [row] = await ds.query('SELECT status FROM routes WHERE name = $1', [
      routeName,
    ]);
    assert.equal(row.status, 'UNVERIFIED');
  },
);

Then(
  'the crag for {string} reverts to UNVERIFIED',
  async function (this: AuthWorld, routeName: string) {
    const ds = this.app.get(DataSource);
    const [row] = await ds.query(
      `SELECT c.status FROM crags c JOIN routes r ON r.crag_id = c.id WHERE r.name = $1`,
      [routeName],
    );
    assert.equal(row.status, 'UNVERIFIED');
  },
);

// --- banned lockout (BL-028 / §12) ---------------------------------

When(
  '{string} requests their notifications',
  async function (this: AuthWorld, email: string) {
    const ds = this.app.get(DataSource);
    const userId = await findUserId(ds, email);
    this.response = await this.http
      .get('/api/notifications')
      .set('X-Test-Mock-Auth', userId);
  },
);

Then('the request is rejected as suspended', function (this: AuthWorld) {
  assert.equal(this.response.status, 403, JSON.stringify(this.response.body));
  assert.equal(
    (this.response.body as { error?: string }).error,
    'ACCOUNT_SUSPENDED',
  );
});

// --- community reports (BL-030) -----------------------------------

When(
  '{string} reports the published photo with reason {string}',
  async function (this: AuthWorld, email: string, reason: string) {
    const ds = this.app.get(DataSource);
    const userId = await findUserId(ds, email);
    assert.ok(this.lastMediaAssetId, 'expected a prior uploaded photo');
    this.response = await this.http
      .post(`/api/media/${this.lastMediaAssetId}/reports`)
      .set('X-Test-Mock-Auth', userId)
      .send({ reason });
    assert.equal(
      this.response.status,
      201,
      `report failed: ${JSON.stringify(this.response.body)}`,
    );
  },
);

Then(
  'the Flag Queue lists the uploaded photo with {int} report',
  async function (this: AuthWorld, reportCount: number) {
    const ds = this.app.get(DataSource);
    const adminId = await findUserId(ds, 'admin@example.com');
    const res = await this.http
      .get('/api/admin/flag-queue')
      .set('X-Test-Mock-Auth', adminId);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const items = res.body as Array<{
      mediaAssetId: string;
      reports: unknown[];
    }>;
    const item = items.find((i) => i.mediaAssetId === this.lastMediaAssetId);
    assert.ok(item, 'expected the reported photo in the flag queue');
    assert.equal(item.reports.length, reportCount);
  },
);
