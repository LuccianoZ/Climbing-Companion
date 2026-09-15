// Build a per-region / per-discipline pool of CC-licensed climbing photos from
// Wikimedia Commons, download them, and write photo-manifest.json with
// attribution. Cohesion strategy: each crag draws from its region's pool first,
// then a discipline pool, then a generic climbing pool.
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const OUT = path.join(dir, 'photos');
fs.mkdirSync(OUT, { recursive: true });

const POOLS = {
  'gunks': [
    'Shawangunks climbing', 'Gunks Trapps', 'Shawangunk Ridge climbing',
    'Near Trapps Shawangunks', 'Shawangunks bouldering', 'Trapps Cliff',
  ],
  'adirondacks': [
    'Adirondack rock climbing', 'Poke-O-Moonshine cliff', 'Chapel Pond climbing',
    'Adirondacks cliff climbing', 'Adirondack High Peaks cliff',
  ],
  'powerlinez': ['Hudson Valley bouldering', 'Harriman State Park bouldering'],
  'central park': ['Rat Rock Central Park', 'Central Park bouldering', 'Umpire Rock Central Park'],
  'little falls': ['Moss Island Little Falls', 'Little Falls New York gorge'],
  'niagara glen': ['Niagara Glen', 'Niagara Glen bouldering', 'Niagara Gorge cliff'],
  'disc:TRADITIONAL_CLIMBING': ['traditional climbing crack', 'trad climbing cliff', 'multi-pitch rock climbing'],
  'disc:SPORT_CLIMBING': ['sport climbing quickdraw', 'lead climbing limestone', 'rock climbing bolted route'],
  'disc:BOULDERING': ['bouldering outdoor', 'bouldering crash pad', 'boulder problem forest'],
  'generic': ['rock climbing cliff', 'rock climber outdoors', 'climbing granite face'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(term, limit = 12) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search' +
    `&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(term)}` +
    '&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1400';
  const res = await fetch(url, { headers: { 'User-Agent': 'ClimbingCompanion-demo-seed/1.0 (contact: labziminsky@gmail.com)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${term}`);
  const json = await res.json();
  const pages = (json.query && json.query.pages) || {};
  return Object.values(pages)
    .map((p) => {
      const ii = (p.imageinfo || [])[0] || {};
      const em = ii.extmetadata || {};
      const val = (k) => (em[k] && em[k].value ? String(em[k].value).replace(/<[^>]+>/g, '').trim() : null);
      return {
        title: p.title,
        mime: ii.mime,
        width: ii.width,
        height: ii.height,
        url: ii.thumburl || ii.url,
        fullUrl: ii.url,
        descUrl: ii.descriptionurl,
        license: val('LicenseShortName'),
        licenseUrl: val('LicenseUrl'),
        artist: val('Artist'),
        credit: val('Credit'),
      };
    })
    .filter((m) => /^image\/(jpeg|png)$/.test(m.mime || '') && (m.width || 0) >= 700);
}

const OK_LICENSE = /^(CC BY(-SA)?( \d)?|CC0|Public domain|No restrictions)/i;

async function download(m, idx) {
  const ext = m.mime === 'image/png' ? 'png' : 'jpg';
  const file = path.join(OUT, `${String(idx).padStart(3, '0')}.${ext}`);
  const res = await fetch(m.url, { headers: { 'User-Agent': 'ClimbingCompanion-demo-seed/1.0' } });
  if (!res.ok) throw new Error(`dl HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8000) throw new Error('too small');
  fs.writeFileSync(file, buf);
  return { file: path.basename(file), bytes: buf.length, ext };
}

(async () => {
  const manifest = { pools: {}, images: {} };
  const seen = new Set();
  let idx = 0;

  for (const [pool, terms] of Object.entries(POOLS)) {
    manifest.pools[pool] = [];
    for (const term of terms) {
      let results = [];
      try {
        results = await search(term);
      } catch (e) {
        console.warn(`  ! ${term}: ${e.message}`);
      }
      await sleep(300);
      for (const m of results) {
        if (seen.has(m.title)) continue;
        if (!OK_LICENSE.test(m.license || '')) continue;
        if (/\.(pdf|svg|tif)/i.test(m.title)) continue;
        seen.add(m.title);
        try {
          const dl = await download(m, idx);
          const id = dl.file;
          manifest.images[id] = {
            id,
            bytes: dl.bytes,
            mime: m.mime,
            sourcePool: pool,
            searchTerm: term,
            title: m.title,
            descUrl: m.descUrl,
            license: m.license,
            licenseUrl: m.licenseUrl,
            artist: m.artist || m.credit || 'Unknown (Wikimedia Commons)',
          };
          manifest.pools[pool].push(id);
          idx += 1;
          console.log(`  [${pool}] ${id}  ${m.title.slice(5, 55)}  (${m.license})`);
          await sleep(150);
        } catch (e) {
          console.warn(`  ! dl ${m.title}: ${e.message}`);
        }
        if (manifest.pools[pool].length >= 10) break;
      }
      if (manifest.pools[pool].length >= 10) break;
    }
  }

  fs.writeFileSync(path.join(dir, 'photo-manifest.json'), JSON.stringify(manifest, null, 2));
  const total = Object.keys(manifest.images).length;
  console.log(`\n${total} images downloaded`);
  for (const [p, ids] of Object.entries(manifest.pools)) console.log(`  ${p}: ${ids.length}`);
})();
