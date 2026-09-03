import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';

// Shared BDD fixture helpers for the Sept 3 revision (AR-51 / AR-52).
//
// After AR-51, submitting a route needs >= 3 ROUTE_SUBMISSION_PHOTO ids and
// submitting a gym needs >= 3 GYM_SUBMISSION_PHOTO ids plus disciplines and
// a full weekly-hours object. The pre-existing "{string} submits a route/gym"
// steps inject these transparently so every feature that seeds a route or
// gym through them keeps working without editing its .feature text -- the
// new behaviour is exercised explicitly in submission-proximity.feature,
// gym-submission-and-verification.feature and admin-stewardship.feature.

export async function findUserIdByEmail(
  dataSource: DataSource,
  email: string,
): Promise<string> {
  const [user] = await dataSource.query(
    'SELECT id FROM users WHERE email = $1',
    [email],
  );
  assert.ok(user?.id, `expected a registered user ${email}`);
  return user.id as string;
}

// Inserts `count` unlinked media_assets rows owned by `ownerUserId` with the
// given *_SUBMISSION_PHOTO purpose, and returns their ids. The submit
// transaction's linkSubmissionPhotos() then stamps the subject FK onto them.
export async function seedSubmissionPhotoIds(
  dataSource: DataSource,
  ownerUserId: string,
  purpose: 'ROUTE_SUBMISSION_PHOTO' | 'GYM_SUBMISSION_PHOTO',
  count = 3,
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const [row] = await dataSource.query(
      `INSERT INTO media_assets (owner_user_id, purpose, payload, mime_type, byte_size, etag)
       VALUES ($1, $2::media_purpose, $3, 'image/jpeg', 3, $4)
       RETURNING id`,
      [ownerUserId, purpose, Buffer.from([1, 2, 3]), `seed-sub-${purpose}-${i}-${Math.random()}`],
    );
    ids.push(row.id as string);
  }
  return ids;
}

// A valid 7-day schedule: closed Sunday, 06:00-22:00 Mon-Fri, 24h Saturday.
export const SAMPLE_OPERATING_HOURS = {
  '0': [],
  '1': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '2': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '3': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '4': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '5': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '6': [{ opens: '00:00', closes: '00:00', fullDay: true }],
};
