// Crawl OpenBeta GraphQL for a curated set of NY + Niagara Glen areas.
// Output: openbeta-raw.json  { crags:[...], climbs:[...] }
const fs = require('fs');
const API = 'https://api.openbeta.io/';

const ROOTS = [
  { uuid: '3d71209f-36a0-528f-aa53-a7e476c10115', cap: 55, label: 'The Trapps' },
  { uuid: 'da7946f9-8d59-5cf6-94e3-eb690d321b42', cap: 28, label: 'Near Trapps' },
  { uuid: 'ac0a626a-495a-57b9-99f0-b9a0687b3f97', cap: 24, label: 'Trapps Bouldering' },
  { uuid: 'cfbb6b25-e96d-50a5-ba64-1069b9e24099', cap: 30, label: 'Peterskill' },
  { uuid: 'aa3aae11-502f-5ea0-ba74-823755577cb0', cap: 22, label: 'Poke-O-Moonshine Main Face' },
  { uuid: '416ccb3c-d275-5f65-9aa6-9d5541a04efa', cap: 28, label: 'Chapel Pond Pass' },
  { uuid: '92aa8885-6ff6-5eaf-bb8c-b93b1f257082', cap: 22, label: 'Powerlinez Bouldering' },
  { uuid: 'e1ff92dd-a8e6-51e3-b13b-551737e0e0c3', cap: 16, label: 'Central Park - Rat Rock' },
  { uuid: 'ca72ce21-716e-5cab-afc8-42ebfecca6b3', cap: 22, label: 'Shelving Rock' },
  { uuid: '593659d1-c71b-59da-8c85-a43d4ea3078d', cap: 20, label: 'Moss Island' },
  { uuid: '8373b8a3-113f-5fc5-b497-a91f903368a9', cap: 24, label: 'Niagara Glen' },
];

const AREA_Q = `query A($uuid: ID) {
  area(uuid: $uuid) {
    uuid area_name totalClimbs pathTokens
    metadata { lat lng }
    media { mediaUrl format }
    children { uuid area_name totalClimbs metadata { lat lng } }
    climbs {
      uuid name fa yds
      type { sport trad bouldering tr aid mixed ice alpine }
      grades { yds vscale french }
      boltsCount length safety
      metadata { lat lng }
      content { description protection location }
      media { mediaUrl format width height }
    }
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 200));
      return json.data;
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(800 * (attempt + 1));
    }
  }
}

function pickDiscipline(t) {
  if (!t) return null;
  if (t.bouldering) return 'BOULDERING';
  if (t.trad) return 'TRADITIONAL_CLIMBING';
  if (t.sport) return 'SPORT_CLIMBING';
  return null; // tr-only / aid / ice / mixed / alpine / untyped
}

async function crawlRoot(root, crags, climbs, seenClimb) {
  const queue = [{ uuid: root.uuid, depth: 0 }];
  const visited = new Set();
  let taken = 0;
  let requests = 0;

  while (queue.length && taken < root.cap && requests < 90) {
    const { uuid, depth } = queue.shift();
    if (visited.has(uuid)) continue;
    visited.add(uuid);
    requests += 1;

    let data;
    try {
      data = await gql(AREA_Q, { uuid });
    } catch (e) {
      console.warn(`  ! ${uuid}: ${e.message}`);
      continue;
    }
    await sleep(120);
    const a = data && data.area;
    if (!a) continue;

    const leafClimbs = (a.climbs || []).filter((c) => pickDiscipline(c.type));
    if (leafClimbs.length) {
      const cragLat = a.metadata && a.metadata.lat;
      const cragLng = a.metadata && a.metadata.lng;
      if (typeof cragLat === 'number' && typeof cragLng === 'number') {
        const room = root.cap - taken;
        const use = leafClimbs.slice(0, Math.max(0, room));
        if (use.length) {
          crags.push({
            srcUuid: a.uuid,
            name: a.area_name,
            path: a.pathTokens || [],
            rootLabel: root.label,
            lat: cragLat,
            lng: cragLng,
            media: (a.media || [])
              .filter((m) => /\.(jpg|jpeg|png)$/i.test(m.mediaUrl || ''))
              .map((m) => ({ url: m.mediaUrl, format: m.format })),
          });
          for (const c of use) {
            if (seenClimb.has(c.uuid)) continue;
            seenClimb.add(c.uuid);
            climbs.push({
              srcUuid: c.uuid,
              cragUuid: a.uuid,
              name: c.name,
              fa: c.fa || null,
              discipline: pickDiscipline(c.type),
              yds: (c.grades && c.grades.yds) || c.yds || null,
              vscale: (c.grades && c.grades.vscale) || null,
              boltsCount: c.boltsCount || null,
              length: c.length || null,
              safety: c.safety || null,
              lat: c.metadata && c.metadata.lat,
              lng: c.metadata && c.metadata.lng,
              description: (c.content && c.content.description) || null,
              protection: (c.content && c.content.protection) || null,
              location: (c.content && c.content.location) || null,
              media: (c.media || [])
                .filter((m) => /\.(jpg|jpeg|png)$/i.test(m.mediaUrl || ''))
                .map((m) => ({ url: m.mediaUrl, format: m.format })),
            });
            taken += 1;
          }
        }
      }
    }

    // Enqueue children with a known climb count, and (for stale-aggregate
    // areas like Niagara Glen, where totalClimbs reads 0 but climbs exist)
    // always descend the first two levels regardless.
    for (const ch of a.children || []) {
      if (visited.has(ch.uuid)) continue;
      if ((ch.totalClimbs || 0) > 0 || depth < 2) {
        queue.push({ uuid: ch.uuid, depth: depth + 1 });
      }
    }
  }
  console.log(`  ${root.label}: ${taken} climbs`);
}

(async () => {
  const crags = [];
  const climbs = [];
  const seenClimb = new Set();
  for (const root of ROOTS) {
    console.log(`crawling ${root.label} ...`);
    await crawlRoot(root, crags, climbs, seenClimb);
  }
  const withMedia = climbs.filter((c) => c.media.length).length;
  console.log(`\nTOTAL: ${crags.length} crags, ${climbs.length} climbs (${withMedia} have >=1 photo)`);
  fs.writeFileSync(
    __dirname + '/openbeta-raw.json',
    JSON.stringify({ crags, climbs }, null, 2),
  );
  console.log('wrote openbeta-raw.json');
})();
