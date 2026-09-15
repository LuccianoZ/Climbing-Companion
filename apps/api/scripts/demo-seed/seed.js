'use strict';
/*
 * Demo data seeder for Climbing Companion.
 *
 * Populates a database with ~237 real New York + Niagara Glen outdoor climbs
 * (routes + crags sourced from OpenBeta, CC-BY-SA), CC-licensed route photos
 * (Wikimedia Commons, see PHOTO-ATTRIBUTION.md), ~50 data-only fake climbers,
 * an admin account, and a showcase "demo user" with a deep climb-log history
 * so every analytics chart renders. Writes only to the target DB; makes no
 * network calls. Idempotent-ish: refuses to run if seed users already exist
 * (run teardown.js first).
 *
 * Usage:
 *   node scripts/demo-seed/seed.js "postgres://user:pass@host:5432/climbing_companion_demo"
 *   (or set SEED_DATABASE_URL)
 *
 * NEVER point this at the dev or prod database. It is for a dedicated demo DB.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');
const {
  makeRng,
  makeHelpers,
  sha256,
  renderGrade,
  plurality,
} = require('./lib');

const HERE = __dirname;
const DB_URL = process.argv[2] || process.env.SEED_DATABASE_URL;

const ADMIN = { email: 'labziminsky@gmail.com', password: 'ClimbingIsFun2010$', displayName: 'Lucciano Ziminsky' };
const DEMO = { email: 'alex.demo@climbingcompanion.app', password: 'DemoClimber2026!', displayName: 'Alex Rivera' };
const FAKE_DOMAIN = 'seed.demo.invalid';
const FAKE_USER_COUNT = 50;

const rng = makeRng(20260909);
const H = makeHelpers(rng);
const { int, pick, chance, shuffle, sample, gauss, clampInt, dateBetween } = H;

const NOW = new Date('2026-09-09T12:00:00Z');
const T_MINUS = (days) => new Date(NOW.getTime() - days * 86400000);

// -------------------------------------------------------------------
const FIRST = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Taylor', 'Morgan', 'Jamie', 'Avery', 'Quinn',
  'Devon', 'Skyler', 'Reese', 'Hayden', 'Emerson', 'Rowan', 'Marisol', 'Priya', 'Kenji', 'Luca',
  'Nadia', 'Tomas', 'Ingrid', 'Malik', 'Sofia', 'Dmitri', 'Yuki', 'Leah', 'Owen', 'Bianca',
  'Cole', 'Freya', 'Andre', 'Nora', 'Ravi', 'Elena', 'Gus', 'Maya', 'Theo', 'Cara',
  'Jonas', 'Aisha', 'Pete', 'Vera', 'Hugo', 'Simone', 'Marcus', 'Iris', 'Dylan', 'Greta'];
const LAST = ['Nguyen', 'Alvarez', 'Okafor', 'Bergstrom', 'Kowalski', 'Ramirez', 'Chen', 'Delgado',
  'Whitaker', 'Petrov', 'Haddad', 'Lindqvist', 'Moreau', 'Rossi', 'Fisher', 'Abernathy', 'Cruz',
  'Novak', 'Ellison', 'Farrell', 'Kaur', 'Sorensen', 'Brandt', 'Cabrera', 'Meyer', 'Underwood',
  'Vance', 'Holloway', 'Ishikawa', 'Marchetti', 'Bauer', 'Cordova', 'Stein', 'Pak', 'Renner'];

const BIOS = [
  'Weekend trad climber, mediocre crack technique, unlimited enthusiasm.',
  'Gunks regular since forever. Will belay for coffee.',
  'Boulderer pretending to enjoy ropes.',
  'Chasing sends and good diner breakfasts across the Northeast.',
  'Slab apologist. Heel hooks are a personal failing.',
  'Here for the process, staying for the summit photos.',
  'Trying to climb 5.11 before my knees file a complaint.',
  'Adirondack granite enjoyer. Bug spray is life.',
  'Plastic in winter, choss in summer.',
  'Grade-agnostic, coffee-dependent.',
];

const SUMMARY_BITS = {
  TRADITIONAL_CLIMBING: {
    lead: ['Classic {crag} line', 'Sustained gear route', 'Committing traditional pitch', 'Airy face climbing', 'Old-school {crag} testpiece', 'Steep jugs to a thin crux'],
    mid: ['on solid rock with good stances for gear', 'past a bulge to easier ground', 'with a well-protected crux', 'on positive edges the whole way', 'through a short roof', 'linking discontinuous cracks'],
    end: ['Bring a standard rack.', 'Small cams useful up high.', 'Walk-off descent from the top.', 'Rap the route from fixed anchors.', 'Wanders a bit — watch rope drag.', 'Popular, so expect a short wait on weekends.'],
  },
  SPORT_CLIMBING: {
    lead: ['Well-bolted {crag} route', 'Fun sport pitch', 'Steep clip-up', 'Techy vertical climbing', 'Powerful sport line', 'Endurance route'],
    mid: ['on good holds between the bolts', 'with a boulder-problem crux off the ground', 'that eases after the third clip', 'on surprisingly positive edges', 'through a short overhanging section', 'with a no-hands rest mid-height'],
    end: ['Lower off the chains.', 'Bring 10 draws.', 'Stick-clip the first bolt if you like.', 'Crux is right at the anchor.', 'Great first lead at the grade.', 'Gets afternoon shade.'],
  },
  BOULDERING: {
    lead: ['Powerful {crag} problem', 'Classic lowball', 'Tall, committing highball', 'Crimpy wall problem', 'Slopey topout', 'Fun warm-up'],
    mid: ['off a good sit start', 'with a tricky heel hook beta', 'to a committing move over the lip', 'on small but positive crimps', 'with a big move to the jug', 'that stays hard until the top'],
    end: ['Pads and a spotter recommended.', 'Topout is the crux.', 'Stays dry in light rain.', 'Better in cold, dry conditions.', 'Landing is flat.', 'Traffic polishes the feet — brush the holds.'],
  },
};

const REVIEW_LINES = [
  'Way better than the grade suggests. Do it.',
  'Sandbagged. Bring your A game and a sense of humor.',
  'One of my favorite climbs in the state. Went back twice.',
  'Fun movement, a little runout in the middle but nothing crazy.',
  'Crux is much easier if you find the hidden foot on the left.',
  'Crowded on Saturdays — get there early.',
  'Rock quality is excellent. Gear is bomber the whole way.',
  'Took me three tries but so worth it. Classic.',
  'Bit of a choss pile near the top, otherwise great.',
  'Perfect for a first lead at this grade. Confidence builder.',
  'Slopers were greasy in the humidity. Come back in the fall.',
  'Underrated. No stars in the guidebook but it deserves at least two.',
  'Approach is longer than you think. Worth it though.',
  'Solid warm-up before heading to the harder stuff.',
];
const CRAG_REVIEW_LINES = [
  'Great crag for a full day. Something for everyone.',
  'Shady in the morning, sunny by noon — plan accordingly.',
  'Parking fills up fast on weekends. Carpool if you can.',
  'One of the best concentrations of moderates around.',
  'Bring bug spray in June. You have been warned.',
  'Well worth the drive. Rock is superb.',
];

// -------------------------------------------------------------------
function summaryFor(route, cragShort) {
  const b = SUMMARY_BITS[route.discipline];
  let s = `${pick(b.lead).replace('{crag}', cragShort)} ${pick(b.mid)}. ${pick(b.end)}`;
  if (route.fa && chance(0.5) && s.length < 190) s += ` FA: ${route.fa}.`;
  return s.slice(0, 250);
}

function gearFor(discipline) {
  if (discipline === 'BOULDERING') return chance(0.15) ? ['CRASH_PAD', 'HELMET'] : ['CRASH_PAD'];
  if (discipline === 'SPORT_CLIMBING') return chance(0.2) ? ['QUICKDRAWS', 'HELMET'] : ['QUICKDRAWS'];
  return chance(0.6) ? ['TRAD_GEAR', 'HELMET'] : ['TRAD_GEAR'];
}

function boltRope(discipline, ordinal) {
  if (discipline === 'BOULDERING') return { bolts: null, rope: null };
  if (discipline === 'SPORT_CLIMBING') {
    const bolts = int(4, 12);
    return { bolts, rope: chance(0.7) ? 60 : 70 };
  }
  // trad: usually no fixed bolts, sometimes a couple
  return { bolts: chance(0.15) ? int(1, 3) : null, rope: chance(0.8) ? 60 : 70 };
}

const REGION_POOL = {
  'The Gunks': 'gunks',
  Adirondacks: 'adirondacks',
  Powerlinez: 'powerlinez',
  'Central Park': 'central park',
  'Little Falls': 'little falls',
  'Niagara Glen': 'niagara glen',
};

// -------------------------------------------------------------------
async function main() {
  if (!DB_URL) throw new Error('pass the demo DATABASE_URL as argv[2] or SEED_DATABASE_URL');
  if (/climbing_companion(_test)?$/.test(new URL(DB_URL).pathname)) {
    throw new Error(`refusing to seed ${new URL(DB_URL).pathname} — use a dedicated demo database`);
  }

  const routesData = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'routes.json'), 'utf8'));
  const photoPools = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'photo-pools.json'), 'utf8'));
  const photoBuf = {};
  for (const meta of Object.values(photoPools.images)) {
    photoBuf[meta.file] = fs.readFileSync(path.join(HERE, 'photos', meta.file));
  }
  const poolFiles = (key) => photoPools.pools[key] || [];

  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  const existing = await db.query(
    `SELECT count(*)::int n FROM users WHERE email = $1 OR email = $2 OR email LIKE $3`,
    [ADMIN.email, DEMO.email, `%@${FAKE_DOMAIN}`],
  );
  if (existing.rows[0].n > 0) {
    throw new Error('seed users already present — run `node scripts/demo-seed/teardown.js <url>` first');
  }

  console.log('hashing passwords…');
  const adminHash = await hash(ADMIN.password);
  const demoHash = await hash(DEMO.password);
  const fakeHash = await hash('demo-seed-not-a-real-login'); // shared; fake users never log in

  await db.query('BEGIN');
  try {
    // ---- media asset helper --------------------------------------
    let mediaCount = 0;
    async function insertPhoto({ ownerId, purpose, file, status = 'APPROVED', subjectRouteId = null }) {
      const buf = photoBuf[file];
      const r = await db.query(
        `INSERT INTO media_assets
           (owner_user_id, purpose, payload, mime_type, byte_size, moderation_status, etag, subject_route_id, created_at, updated_at)
         VALUES ($1,$2::media_purpose,$3,'image/jpeg',$4,$5::media_moderation_status,$6,$7,$8,$8)
         RETURNING id`,
        [ownerId, purpose, buf, buf.length, status, sha256(buf) + '-' + mediaCount, subjectRouteId, T_MINUS(int(1, 200))],
      );
      mediaCount += 1;
      return r.rows[0].id;
    }

    // ---- users --------------------------------------------------
    console.log('users…');
    const mkUser = async (email, hashv, name, opts = {}) => {
      const r = await db.query(
        `INSERT INTO users (email, password_hash, display_name, role, bio, grade_display_pref, is_private, badges_public, created_at, updated_at)
         VALUES ($1,$2,$3,$4::user_role,$5,$6::grade_display_pref,$7,$8,$9,$9) RETURNING id`,
        [email, hashv, name, opts.role || 'VERIFIED_USER', opts.bio || null,
          opts.pref || 'YOSEMITE', !!opts.private, opts.badgesPublic !== false,
          opts.createdAt || T_MINUS(int(120, 300))],
      );
      return r.rows[0].id;
    };

    const adminId = await mkUser(ADMIN.email, adminHash, ADMIN.displayName, { role: 'SYSTEM_ADMIN', createdAt: T_MINUS(320) });
    const demoId = await mkUser(DEMO.email, demoHash, DEMO.displayName, {
      bio: 'NY-based all-arounder. Trad in the Gunks, boulders at the Powerlinez, sport road trips when I can swing it.',
      createdAt: T_MINUS(300),
    });

    const usedNames = new Set([DEMO.displayName, ADMIN.displayName]);
    const fakeIds = [];
    for (let i = 0; i < FAKE_USER_COUNT; i += 1) {
      let name;
      do {
        name = `${pick(FIRST)} ${pick(LAST)}`;
      } while (usedNames.has(name));
      usedNames.add(name);
      const [f, l] = name.split(' ');
      const email = `${f}.${l}${i}`.toLowerCase() + `@${FAKE_DOMAIN}`;
      fakeIds.push(await mkUser(email, fakeHash, name, {
        bio: chance(0.55) ? pick(BIOS) : null,
        private: chance(0.28),
        pref: chance(0.2) ? 'FRENCH' : 'YOSEMITE',
      }));
    }
    const climberPool = [...fakeIds, demoId]; // everyone who can submit/verify/vote/log

    // ---- crags + routes ---------------------------------------
    console.log('crags + routes…');
    const cragIdByTmp = {};
    const cragMeta = {};
    const routesByCrag = {};
    for (const c of routesData.crags) {
      routesByCrag[c.tmpId] = routesData.climbs
        .map((cl, idx) => ({ ...cl, idx }))
        .filter((cl) => cl.cragTmpId === c.tmpId);
    }

    const allRoutes = []; // {id, ordinal, discipline, verified, votes:[], displayOrdinal, cragTmp}
    for (const crag of routesData.crags) {
      const cragChildren = routesByCrag[crag.tmpId];
      if (!cragChildren.length) continue;
      const cragCreatedAt = T_MINUS(int(150, 285));
      const cragCreator = pick(fakeIds);
      const verifiedCrag = chance(0.5);

      const cr = await db.query(
        `INSERT INTO crags (name, location, status, founding_route_id, created_by, verified_at, created_at, updated_at)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, 'UNVERIFIED', NULL, $4, NULL, $5, $5)
         RETURNING id`,
        [crag.name, crag.lng, crag.lat, cragCreator, cragCreatedAt],
      );
      const cragId = cr.rows[0].id;
      cragIdByTmp[crag.tmpId] = cragId;
      cragMeta[crag.tmpId] = { id: cragId, name: crag.name, region: crag.region, verifiedCrag, createdAt: cragCreatedAt };

      const cragShort = crag.name.split('–').pop().trim().replace(/\(.*\)/, '').trim();
      const combinedPool = shuffle([
        ...poolFiles(REGION_POOL[crag.region] || ''),
        ...poolFiles(`disc:${cragChildren[0].discipline}`),
        ...poolFiles('generic'),
      ]);
      const poolPick = (routeIdx) => {
        if (!combinedPool.length) return [];
        const out = [];
        for (let k = 0; k < 3; k += 1) out.push(combinedPool[(routeIdx * 2 + k) % combinedPool.length]);
        return out;
      };

      let foundingRouteId = null;
      for (let ri = 0; ri < cragChildren.length; ri += 1) {
        const cl = cragChildren[ri];
        const isFounding = ri === 0;
        const submitter = pick(climberPool.filter((u) => u !== cragCreator)) || pick(climberPool);
        const routeCreatedAt = new Date(cragCreatedAt.getTime() + int(0, 20) * 86400000);

        // decide verified state
        let verified;
        if (isFounding) verified = verifiedCrag;
        else verified = chance(verifiedCrag ? 0.7 : 0.4);

        const { bolts, rope } = boltRope(cl.discipline, cl.gradeOrdinal);
        // proposed grade: usually the OpenBeta grade, sometimes off by one
        const proposed = clampInt(
          cl.gradeOrdinal + (chance(0.25) ? pick([-1, 1]) : 0),
          0, cl.discipline === 'BOULDERING' ? 18 : 31,
        );

        const rr = await db.query(
          `INSERT INTO routes
             (crag_id, name, location, discipline, gear_requirements, summary, proposed_grade_ordinal,
              bolt_count, min_rope_length_m, status, submitted_by, verified_at, created_at, updated_at)
           VALUES ($1,$2, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5::outdoor_discipline,
             $6::gear_requirement[], $7,$8,$9,$10,$11::lifecycle_status,$12,$13,$14,$14)
           RETURNING id`,
          [
            cragId, cl.name, cl.lng, cl.lat, cl.discipline,
            `{${gearFor(cl.discipline).join(',')}}`,
            summaryFor(cl, cragShort), proposed, bolts, rope,
            verified ? 'VERIFIED' : 'UNVERIFIED', submitter,
            verified ? new Date(routeCreatedAt.getTime() + int(3, 40) * 86400000) : null,
            routeCreatedAt,
          ],
        );
        const routeId = rr.rows[0].id;
        if (isFounding) foundingRouteId = routeId;

        // 3 submission photos (approved)
        for (const file of poolPick(ri)) {
          await insertPhoto({ ownerId: submitter, purpose: 'ROUTE_SUBMISSION_PHOTO', file, subjectRouteId: routeId });
        }

        // verifications + grade votes
        const voteOrdinals = [];
        const verifiers = sample(climberPool.filter((u) => u !== submitter), verified ? int(4, 6) : int(0, 2));
        for (const v of verifiers.slice(0, verified ? verifiers.length : 2)) {
          const vPhoto = await insertPhoto({
            ownerId: v,
            purpose: 'ROUTE_VERIFICATION_PHOTO',
            file: pick(combinedPool.length ? combinedPool : poolFiles('generic')),
          });
          await db.query(
            `INSERT INTO route_verifications (route_id, verifier_user_id, media_asset_id, created_at)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [routeId, v, vPhoto, new Date(routeCreatedAt.getTime() + int(2, 60) * 86400000)],
          );
          const o = clampInt(gauss(cl.gradeOrdinal, 0.8), 0, cl.discipline === 'BOULDERING' ? 18 : 31);
          voteOrdinals.push({ user: v, o });
        }
        // extra standalone voters (only meaningful once verified per app, but
        // harmless to seed; keeps consensus interesting)
        if (verified) {
          for (const u of sample(climberPool.filter((x) => !verifiers.includes(x) && x !== submitter), int(2, 8))) {
            voteOrdinals.push({ user: u, o: clampInt(gauss(cl.gradeOrdinal, 1.0), 0, cl.discipline === 'BOULDERING' ? 18 : 31) });
          }
        }
        const seenVoter = new Set();
        for (const { user, o } of voteOrdinals) {
          if (seenVoter.has(user)) continue;
          seenVoter.add(user);
          await db.query(
            `INSERT INTO route_grade_votes (route_id, voter_user_id, grade_ordinal, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$4) ON CONFLICT (route_id, voter_user_id) DO NOTHING`,
            [routeId, user, o, new Date(routeCreatedAt.getTime() + int(2, 70) * 86400000)],
          );
        }

        const finalVotes = [...seenVoter].map((u) => voteOrdinals.find((v) => v.user === u).o);
        const displayOrdinal = finalVotes.length >= 4 ? plurality(finalVotes) : proposed;
        allRoutes.push({
          id: routeId, ordinal: cl.gradeOrdinal, discipline: cl.discipline,
          verified, displayOrdinal, cragTmp: crag.tmpId, name: cl.name,
          createdAt: routeCreatedAt,
        });
      }

      // close the circular FK + cascade crag status from founding route
      const foundingVerified = allRoutes.find((r) => r.id === foundingRouteId).verified;
      await db.query(
        `UPDATE crags SET founding_route_id = $1, status = $2::lifecycle_status,
           verified_at = $3 WHERE id = $4`,
        [foundingRouteId, foundingVerified ? 'VERIFIED' : 'UNVERIFIED',
          foundingVerified ? new Date(cragCreatedAt.getTime() + int(20, 60) * 86400000) : null, cragId],
      );
    }
    console.log(`  ${allRoutes.length} routes, ${Object.keys(cragIdByTmp).length} crags, ${mediaCount} photos`);

    // ---- reviews ---------------------------------------------
    console.log('reviews…');
    let reviewCount = 0;
    for (const r of allRoutes) {
      if (!chance(0.33)) continue;
      for (let k = 0; k < int(1, 2); k += 1) {
        const author = pick(climberPool);
        let photoId = null;
        if (chance(0.15)) {
          photoId = await insertPhoto({ ownerId: author, purpose: 'REVIEW_PHOTO', file: pick(poolFiles('generic').concat(poolFiles('disc:' + r.discipline))) });
        }
        await db.query(
          `INSERT INTO reviews (target_type, target_route_id, author_id, body, media_asset_id, created_at)
           VALUES ('ROUTE',$1,$2,$3,$4,$5)`,
          [r.id, author, pick(REVIEW_LINES), photoId, new Date(r.createdAt.getTime() + int(10, 250) * 86400000)],
        );
        reviewCount += 1;
      }
    }
    for (const tmp of Object.keys(cragIdByTmp)) {
      if (!chance(0.5)) continue;
      for (let k = 0; k < int(1, 2); k += 1) {
        await db.query(
          `INSERT INTO reviews (target_type, target_crag_id, author_id, body, created_at)
           VALUES ('CRAG',$1,$2,$3,$4)`,
          [cragIdByTmp[tmp], pick(climberPool), pick(CRAG_REVIEW_LINES), T_MINUS(int(10, 180))],
        );
        reviewCount += 1;
      }
    }
    console.log(`  ${reviewCount} reviews`);

    // ---- climb logs (fake users) ----------------------------
    console.log('climb logs…');
    const verifiedRoutes = allRoutes.filter((r) => r.verified);
    const logTargets = verifiedRoutes.length ? verifiedRoutes : allRoutes;
    let logCount = 0;
    for (const uid of fakeIds) {
      const n = int(4, 26);
      for (let i = 0; i < n; i += 1) {
        const r = chance(0.8) ? pick(logTargets) : pick(allRoutes);
        const attempted = chance(r.displayOrdinal >= 14 ? 0.4 : 0.15);
        await db.query(
          `INSERT INTO climb_logs (route_id, user_id, outcome, grade_snapshot_ordinal, logged_at)
           VALUES ($1,$2,$3::climb_outcome,$4,$5)`,
          [r.id, uid, attempted ? 'ATTEMPTED' : 'COMPLETED',
            clampInt(r.displayOrdinal + (chance(0.15) ? pick([-1, 1]) : 0), 0, r.discipline === 'BOULDERING' ? 18 : 31),
            dateBetween(T_MINUS(250), NOW)],
        );
        logCount += 1;
      }
    }

    // ---- demo user showcase history ------------------------
    console.log('demo user history…');
    const byDisc = (d) => allRoutes.filter((r) => r.discipline === d);
    const demoPlan = [
      { disc: 'TRADITIONAL_CLIMBING', completed: 24, attempted: 6, gradeBias: [2, 13] },
      { disc: 'BOULDERING', completed: 14, attempted: 5, gradeBias: [1, 7] },
      { disc: 'SPORT_CLIMBING', completed: 9, attempted: 4, gradeBias: [8, 16] },
    ];
    let demoLogs = 0;
    for (const plan of demoPlan) {
      const pool = byDisc(plan.disc);
      if (!pool.length) continue;
      const total = plan.completed + plan.attempted;
      for (let i = 0; i < total; i += 1) {
        // progression: earlier logs easier, later harder
        const frac = i / total;
        const targetOrd = plan.gradeBias[0] + frac * (plan.gradeBias[1] - plan.gradeBias[0]);
        const candidates = pool
          .map((r) => ({ r, d: Math.abs(r.displayOrdinal - targetOrd) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 8);
        const r = pick(candidates).r;
        const attempted = i >= plan.completed;
        const daysAgo = Math.round(250 - frac * 235 + gauss(0, 8));
        await db.query(
          `INSERT INTO climb_logs (route_id, user_id, outcome, grade_snapshot_ordinal, logged_at)
           VALUES ($1,$2,$3::climb_outcome,$4,$5)`,
          [r.id, demoId, attempted ? 'ATTEMPTED' : 'COMPLETED', r.displayOrdinal, T_MINUS(Math.max(2, daysAgo))],
        );
        demoLogs += 1;
        // demo user also votes on some of what they climb
        if (chance(0.4)) {
          await db.query(
            `INSERT INTO route_grade_votes (route_id, voter_user_id, grade_ordinal, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$4) ON CONFLICT (route_id, voter_user_id) DO NOTHING`,
            [r.id, demoId, clampInt(r.displayOrdinal + (chance(0.3) ? pick([-1, 1]) : 0), 0, r.discipline === 'BOULDERING' ? 18 : 31), T_MINUS(Math.max(2, daysAgo - 1))],
          );
        }
      }
    }
    console.log(`  ${logCount} fake-user logs + ${demoLogs} demo-user logs`);

    // demo user reviews a few classics
    for (const r of sample(verifiedRoutes, 3)) {
      await db.query(
        `INSERT INTO reviews (target_type, target_route_id, author_id, body, created_at)
         VALUES ('ROUTE',$1,$2,$3,$4)`,
        [r.id, demoId, pick(REVIEW_LINES), T_MINUS(int(5, 120))],
      );
    }

    // ---- friendships + invite links -----------------------
    console.log('friendships…');
    const friendPairs = new Set();
    const addFriendship = async (x, y) => {
      if (x === y) return;
      const key = [x, y].sort().join('|');
      if (friendPairs.has(key)) return;
      friendPairs.add(key);
      const [req, addr] = chance(0.5) ? [x, y] : [y, x];
      await db.query(
        `INSERT INTO friendships (requester_id, addressee_id, status, created_at, responded_at)
         VALUES ($1,$2,'ACTIVE',$3,$3)`,
        [req, addr, T_MINUS(int(10, 240))],
      );
    };
    const demoFriends = sample(fakeIds, 6);
    for (const f of demoFriends) await addFriendship(demoId, f);
    for (let i = 0; i < 40; i += 1) {
      const [a, b] = sample(fakeIds, 2);
      await addFriendship(a, b);
    }
    // open invite links: one authored by a fake user for the demo user to
    // redeem live, one authored by the demo user.
    const inviteFromFake = 'demoseed-' + Math.random().toString(36).slice(2, 12);
    const inviteFromDemo = 'demoseed-' + Math.random().toString(36).slice(2, 12);
    const inviterFake = pick(fakeIds.filter((f) => !demoFriends.includes(f)));
    await db.query(
      `INSERT INTO friend_invite_links (token, creator_id, created_at, expires_at)
       VALUES ($1,$2,$3,$4),($5,$6,$3,$4)`,
      [inviteFromFake, inviterFake, T_MINUS(1), new Date(NOW.getTime() + 6 * 86400000),
        inviteFromDemo, demoId],
    );

    // ---- notifications for the demo user -----------------
    for (let i = 0; i < 3; i += 1) {
      await db.query(
        `INSERT INTO notifications (recipient_user_id, type, related_entity_id, created_at)
         VALUES ($1,'FRIEND_ADDED',NULL,$2)`,
        [demoId, T_MINUS(int(15, 200))],
      );
    }
    await db.query(
      `INSERT INTO notifications (recipient_user_id, type, related_entity_id, created_at)
       VALUES ($1,'IMAGE_REJECTED',NULL,$2)`,
      [demoId, T_MINUS(34)],
    );

    await db.query('COMMIT');
    process.stdout.write('compacting (VACUUM FULL)… ');
    await db.query('VACUUM FULL ANALYZE'); // reclaim single-transaction bloat (~490MB -> ~250MB)
    console.log('done');

    // ---- summary ----------------------------------------
    const counts = {};
    for (const t of ['users', 'crags', 'routes', 'media_assets', 'route_verifications', 'route_grade_votes', 'climb_logs', 'reviews', 'friendships', 'friend_invite_links', 'notifications']) {
      counts[t] = (await db.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
    }
    console.log('\n=== seed complete ===');
    console.table(counts);
    console.log('\nAdmin login:  ', ADMIN.email, '/', ADMIN.password);
    console.log('Demo user:    ', DEMO.email, '/', DEMO.password);
    console.log('Open friend-invite tokens (redeem while signed in):');
    console.log('  from a fake climber ->', inviteFromFake);
    console.log('  from the demo user  ->', inviteFromDemo);
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error('\nSEED FAILED:', e.message);
  process.exit(1);
});
