// openbeta-raw.json -> seed-data.json
// - map OpenBeta grades to Climbing Companion canonical ordinals
// - cluster climbs into crags by 300m proximity (matches Foundation §4's rule,
//   so every resulting crag is naturally >300m from every other)
// - keep each climb's real GPS coords
const fs = require('fs');
const dir = __dirname;
const raw = JSON.parse(fs.readFileSync(dir + '/openbeta-raw.json', 'utf8'));

// ---- grade parsing -------------------------------------------------
const YDS_BASE = {
  '5.0': 0, '5.1': 1, '5.2': 1, '5.3': 2, '5.4': 2, '5.5': 3, '5.6': 4,
  '5.7': 5, '5.8': 6, '5.9': 7,
};
const YDS_LETTER = { a: 0, b: 1, c: 2, d: 3 };
// 5.10a = 8; each number decade spans 4 ordinals
function ydsToOrdinal(s) {
  if (!s) return null;
  const str = s.trim().toLowerCase().replace(/\s+/g, '');
  let m = str.match(/^5\.(\d+)([abcd])?([+-])?(?:\/[abcd])?$/);
  if (!m) {
    m = str.match(/^5\.(\d+)([abcd])?\/([abcd])?$/);
    if (m) return ydsToOrdinal(`5.${m[1]}${m[2] || ''}`); // take lower of a/b
    return null;
  }
  const dec = parseInt(m[1], 10);
  const letter = m[2];
  const mod = m[3];
  if (dec <= 9) {
    const base = YDS_BASE[`5.${dec}`];
    return base == null ? null : base;
  }
  // 5.10 -> ordinal 8..; decade 10 starts at 8
  const decadeStart = 8 + (dec - 10) * 4;
  if (letter) return decadeStart + YDS_LETTER[letter];
  if (mod === '-') return decadeStart;
  if (mod === '+') return decadeStart + 3;
  return decadeStart + 1; // bare "5.11" -> mid-low (b)
}
// VB=0, V0=1, ... V17=18
function vToOrdinal(s) {
  if (!s) return null;
  const str = s.trim().toUpperCase();
  if (str.startsWith('VB')) return 0;
  const m = str.match(/^V(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Math.min(18, n + 1);
}

// ---- haversine ---------------------------------------------------
function metersBetween(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---- build climbs ------------------------------------------------
const cragByUuid = Object.fromEntries(raw.crags.map((c) => [c.srcUuid, c]));
const clean = (t, max) => {
  if (!t) return null;
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
};

// Clean OpenBeta area labels: drop "a1. " / "j. " / "3. " / "* " ordering
// prefixes, "A: " region codes, trailing ", The".
function tidy(s) {
  if (!s) return null;
  return String(s)
    .replace(/^\*\s*/, '')
    .replace(/^[A-Za-z]?\d*[.:]\s+/, '')
    .replace(/^[A-Z]:\s+/, '')
    .replace(/,\s*The$/i, '')
    .replace(/\s*-\s*(left|right)$/i, '')
    .replace(/^The\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let climbs = raw.climbs.map((c) => {
  const ordinal =
    c.discipline === 'BOULDERING' ? vToOrdinal(c.vscale) : ydsToOrdinal(c.yds);
  const srcCrag = cragByUuid[c.cragUuid] || {};
  return {
    srcUuid: c.srcUuid,
    name: clean(c.name, 100),
    discipline: c.discipline,
    gradeOrdinal: ordinal,
    displayGrade: c.discipline === 'BOULDERING' ? c.vscale : c.yds,
    lat: c.lat,
    lng: c.lng,
    boltsCount:
      c.boltsCount && c.boltsCount > 0 ? c.boltsCount : null,
    lengthM: c.length && c.length > 0 ? Math.round(c.length) : null,
    fa: clean(c.fa, 120),
    rawDescription: c.description,
    rawProtection: c.protection,
    rawLocation: c.location,
    srcAreaName: srcCrag.name,
    srcParent: tidy((srcCrag.path || []).slice(-2)[0]),
    srcLeaf: tidy(srcCrag.name),
    rootLabel: srcCrag.rootLabel,
    media: c.media,
  };
});

const before = climbs.length;
climbs = climbs.filter(
  (c) =>
    c.gradeOrdinal != null &&
    c.name &&
    typeof c.lat === 'number' &&
    typeof c.lng === 'number' &&
    c.lat !== 0,
);
console.log(`climbs: ${before} -> ${climbs.length} after grade/coord filter`);

// ---- cluster into crags (300m) ---------------------------------
const CLUSTER_M = 250;
const crags = [];
for (const climb of climbs) {
  let best = null;
  let bestD = Infinity;
  for (const crag of crags) {
    const d = metersBetween(climb, crag);
    if (d < CLUSTER_M && d < bestD) {
      best = crag;
      bestD = d;
    }
  }
  if (!best) {
    best = {
      tmpId: crags.length,
      lat: climb.lat,
      lng: climb.lng,
      members: [],
      parentVotes: {},
      leafVotes: {},
      rootVotes: {},
    };
    crags.push(best);
  }
  best.members.push(climb);
  climb._crag = best.tmpId;
  const bump = (o, k) => k && (o[k] = (o[k] || 0) + 1);
  bump(best.parentVotes, climb.srcParent);
  bump(best.leafVotes, climb.srcLeaf);
  bump(best.rootVotes, climb.rootLabel);
  // running centroid
  const n = best.members.length;
  best.lat = best.lat + (climb.lat - best.lat) / n;
  best.lng = best.lng + (climb.lng - best.lng) / n;
}

// Trim oversized crags to keep the total near ~220 and the map readable.
// Sample evenly across the grade range rather than taking the first N (which
// would bin to one sub-wall).
const MAX_PER_CRAG = 22;
for (const crag of crags) {
  if (crag.members.length <= MAX_PER_CRAG) continue;
  const sorted = [...crag.members].sort((a, b) => a.gradeOrdinal - b.gradeOrdinal);
  const step = sorted.length / MAX_PER_CRAG;
  const kept = [];
  for (let i = 0; i < MAX_PER_CRAG; i += 1) kept.push(sorted[Math.floor(i * step)]);
  const keptSet = new Set(kept);
  crag.members = crag.members.filter((m) => keptSet.has(m));
}
climbs = climbs.filter((c) => crags[c._crag].members.includes(c));

// verify separation
let tooClose = 0;
for (let i = 0; i < crags.length; i += 1)
  for (let j = i + 1; j < crags.length; j += 1)
    if (metersBetween(crags[i], crags[j]) < CLUSTER_M) tooClose += 1;

const topKey = (o) =>
  Object.keys(o).length ? Object.entries(o).sort((a, b) => b[1] - a[1])[0][0] : null;
const REGION = {
  'The Trapps': 'The Gunks',
  'Near Trapps': 'The Gunks',
  'Trapps Bouldering': 'The Gunks',
  Peterskill: 'The Gunks',
  'Poke-O-Moonshine Main Face': 'Adirondacks',
  'Chapel Pond Pass': 'Adirondacks',
  'Powerlinez Bouldering': 'Powerlinez',
  'Central Park - Rat Rock': 'Central Park',
  'Shelving Rock': 'Adirondacks',
  'Moss Island': 'Little Falls',
  'Niagara Glen': 'Niagara Glen',
};
// Some OpenBeta "parent" labels are route-range spans, not real crag names.
const BAD_PARENT = /\bto the\b|^Rock$|^The \w+ (Wall|Face|Area)$/i;

// First pass: pick a base name per cluster (parent area, falling back to leaf).
crags.forEach((c) => {
  const parent = topKey(c.parentVotes);
  const leaf = topKey(c.leafVotes);
  c.region = REGION[topKey(c.rootVotes)] || topKey(c.rootVotes);
  let base = parent && !BAD_PARENT.test(parent) ? parent : null;
  if (!base) base = leaf && !BAD_PARENT.test(leaf) ? leaf : parent || leaf;
  c.base = base;
  c.leafName = leaf && leaf !== base ? leaf : null;
});
// Second pass: disambiguate clusters that share a base name.
const baseCounts = {};
crags.forEach((c) => (baseCounts[c.base] = (baseCounts[c.base] || 0) + 1));
const finalCrags = crags.map((c) => {
  let name = c.base;
  if (baseCounts[c.base] > 1 && c.leafName) name = `${c.base} (${c.leafName})`;
  const full =
    c.region && !name.toLowerCase().includes(c.region.toLowerCase())
      ? `${c.region} – ${name}`
      : name;
  return {
    tmpId: c.tmpId,
    name: clean(full, 100),
    lat: Number(c.lat.toFixed(6)),
    lng: Number(c.lng.toFixed(6)),
    region: c.region,
    routeCount: c.members.length,
  };
});

const out = {
  meta: {
    source: 'OpenBeta (openbeta.io) GraphQL API, CC-BY-SA 4.0',
    generatedAt: new Date().toISOString(),
    clusterMeters: CLUSTER_M,
  },
  crags: finalCrags,
  climbs: climbs.map((c) => ({
    cragTmpId: c._crag,
    name: c.name,
    discipline: c.discipline,
    gradeOrdinal: c.gradeOrdinal,
    displayGrade: c.displayGrade,
    lat: Number(c.lat.toFixed(6)),
    lng: Number(c.lng.toFixed(6)),
    boltsCount: c.boltsCount,
    lengthM: c.lengthM,
    fa: c.fa,
    rawDescription: c.rawDescription,
    rawProtection: c.rawProtection,
    rawLocation: c.rawLocation,
    media: c.media,
  })),
};
fs.writeFileSync(dir + '/seed-data.json', JSON.stringify(out, null, 2));

const byDisc = climbs.reduce((m, c) => ((m[c.discipline] = (m[c.discipline] || 0) + 1), m), {});
const gradeRange = climbs.reduce(
  (m, c) => [Math.min(m[0], c.gradeOrdinal), Math.max(m[1], c.gradeOrdinal)],
  [99, -99],
);
console.log(`crags: ${finalCrags.length} (pairs closer than ${CLUSTER_M}m: ${tooClose})`);
console.log('by discipline:', byDisc);
console.log('grade ordinal range:', gradeRange);
console.log('routes/crag:', finalCrags.map((c) => c.routeCount).sort((a, b) => b - a).join(','));
console.log('\ncrag names:');
finalCrags.forEach((c) => console.log(`  ${c.routeCount.toString().padStart(3)}  ${c.name}  (${c.lat},${c.lng})`));
