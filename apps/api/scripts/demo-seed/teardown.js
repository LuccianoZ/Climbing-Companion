'use strict';
/*
 * Removes everything seed.js created, in FK-safe order, without touching any
 * gyms / gym check-ins / gym badges you added yourself. Scoped by the seed
 * user set (the two known accounts + the @seed.demo.invalid domain) and by
 * the fact that seed.js is the only source of crags and routes in a demo DB.
 *
 * Usage: node scripts/demo-seed/teardown.js "postgres://…/climbing_companion_demo"
 */
const { Client } = require('pg');

const DB_URL = process.argv[2] || process.env.SEED_DATABASE_URL;
const ADMIN_EMAIL = 'labziminsky@gmail.com';
const DEMO_EMAIL = 'alex.demo@climbingcompanion.app';
const FAKE_DOMAIN = 'seed.demo.invalid';

async function main() {
  if (!DB_URL) throw new Error('pass the demo DATABASE_URL as argv[2] or SEED_DATABASE_URL');
  if (/climbing_companion(_test)?$/.test(new URL(DB_URL).pathname)) {
    throw new Error(`refusing to run against ${new URL(DB_URL).pathname}`);
  }
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  const seedUserFilter = `(email = '${ADMIN_EMAIL}' OR email = '${DEMO_EMAIL}' OR email LIKE '%@${FAKE_DOMAIN}')`;

  await db.query('BEGIN');
  try {
    const before = (await db.query(`SELECT count(*)::int n FROM users WHERE ${seedUserFilter}`)).rows[0].n;
    if (before === 0) {
      console.log('no seed users found — nothing to tear down');
      await db.query('ROLLBACK');
      return;
    }

    // children of routes/crags/users (seed.js owns every crag + route)
    const steps = [
      ['climb_logs', `DELETE FROM climb_logs`],
      ['route_grade_votes', `DELETE FROM route_grade_votes`],
      ['route_verifications', `DELETE FROM route_verifications`],
      ['reviews', `DELETE FROM reviews WHERE target_gym_id IS NULL`],
      ['notifications', `DELETE FROM notifications WHERE recipient_user_id IN (SELECT id FROM users WHERE ${seedUserFilter})`],
      ['friend_invite_links', `DELETE FROM friend_invite_links WHERE creator_id IN (SELECT id FROM users WHERE ${seedUserFilter}) OR consumed_by_id IN (SELECT id FROM users WHERE ${seedUserFilter})`],
      ['friendships', `DELETE FROM friendships WHERE requester_id IN (SELECT id FROM users WHERE ${seedUserFilter}) OR addressee_id IN (SELECT id FROM users WHERE ${seedUserFilter})`],
      // route/review/verification photos + anything a seed user owns that is
      // not attached to a gym you added
      ['media_assets', `DELETE FROM media_assets WHERE subject_route_id IS NOT NULL OR (subject_gym_id IS NULL AND owner_user_id IN (SELECT id FROM users WHERE ${seedUserFilter}))`],
      ['crags.founding_route_id', `UPDATE crags SET founding_route_id = NULL`],
      ['routes', `DELETE FROM routes`],
      ['crags', `DELETE FROM crags`],
    ];
    for (const [label, sql] of steps) {
      const r = await db.query(sql);
      console.log(`  ${label}: ${r.rowCount}`);
    }

    // users last — but keep any seed user still referenced by gym data you own
    const gymRefs = `
      SELECT submitted_by AS id FROM gyms
      UNION SELECT user_id FROM gym_checkins
      UNION SELECT verifier_user_id FROM gym_verifications
      UNION SELECT user_id FROM gym_badges
      UNION SELECT user_id FROM gym_streaks
      UNION SELECT owner_user_id FROM media_assets`;
    const del = await db.query(
      `DELETE FROM users WHERE ${seedUserFilter} AND id NOT IN (${gymRefs})`,
    );
    const kept = (await db.query(`SELECT count(*)::int n FROM users WHERE ${seedUserFilter}`)).rows[0].n;
    console.log(`  users: ${del.rowCount} deleted, ${kept} kept (still referenced by gym data)`);

    await db.query('COMMIT');
    console.log('\nteardown complete');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error('\nTEARDOWN FAILED:', e.message);
  process.exit(1);
});
