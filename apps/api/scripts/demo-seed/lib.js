'use strict';
// Shared helpers for the demo seed / teardown scripts.
const crypto = require('crypto');

// ---- deterministic RNG (mulberry32) ------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeHelpers(rng) {
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chance = (p) => rng() < p;
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sample = (arr, n) => shuffle(arr).slice(0, Math.min(n, arr.length));
  // normal-ish via sum of uniforms, rounded, clamped
  // ~N(0,1)-ish: sum of 3 uniforms is mean 1.5, sd ~0.5, so /0.5 normalises.
  const gauss = (mean, sd) => mean + ((rng() + rng() + rng() - 1.5) / 0.5) * sd;
  const clampInt = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x)));
  const dateBetween = (start, end) =>
    new Date(start.getTime() + rng() * (end.getTime() - start.getTime()));
  return { int, pick, chance, shuffle, sample, gauss, clampInt, dateBetween, rng };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ---- grade rendering (mirrors Foundation §3) --------------------
const YDS = [
  '5.0', '5.1/5.2', '5.3/5.4', '5.5', '5.6', '5.7', '5.8', '5.9',
  '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d',
  '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b', '5.13c', '5.13d',
  '5.14a', '5.14b', '5.14c', '5.14d', '5.15a', '5.15b', '5.15c', '5.15d',
];
const VS = ['VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
  'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17'];
const renderGrade = (ordinal, discipline) =>
  discipline === 'BOULDERING' ? VS[ordinal] || `V?${ordinal}` : YDS[ordinal] || `5.?${ordinal}`;

// plurality winner, ties -> lower ordinal (Foundation §6)
function plurality(ordinals) {
  const counts = new Map();
  for (const o of ordinals) counts.set(o, (counts.get(o) || 0) + 1);
  let best = null;
  let bestN = -1;
  for (const [o, n] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (n > bestN) {
      best = o;
      bestN = n;
    }
  }
  return best;
}

// FK-reverse order for scoped teardown (children first).
const SEED_TABLES_CHILD_FIRST = [
  'climb_logs',
  'route_grade_votes',
  'route_verifications',
  'reviews',
  'notifications',
  'friend_invite_links',
  'friendships',
  'media_assets',
  'routes',
  'crags',
];

module.exports = {
  makeRng,
  makeHelpers,
  sha256,
  renderGrade,
  plurality,
  YDS,
  VS,
  SEED_TABLES_CHILD_FIRST,
};
