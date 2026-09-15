// Supplemental targeted fetch to shore up weak pools. Appends into
// photo-manifest.json (continuing the numeric id sequence).
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const OUT = path.join(dir, 'photos');

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'photo-manifest.json'), 'utf8'));
let idx = Object.keys(manifest.images).length
  ? Math.max(...Object.keys(manifest.images).map((f) => parseInt(f, 10))) + 1
  : 0;
const seen = new Set(Object.values(manifest.images).map((i) => i.title));

const POOLS = {
  gunks: ['Mohonk Preserve climbing', 'Shawangunk Ridge cliff climber', 'Sky Top Mohonk'],
  adirondacks: ['Adirondack cliff climber', 'Chapel Pond Slab', 'Wallface Adirondacks', 'Adirondack rock climber'],
  'central park': ['Rat Rock climber Manhattan'],
  'little falls': ['Moss Island climbing', 'Little Falls New York cliff'],
  'niagara glen': ['Niagara Glen boulder', 'Niagara Glen climber', 'Whirlpool Niagara cliff'],
  powerlinez: ['New England bouldering', 'granite boulder forest climber', 'Lincoln Woods bouldering'],
  'disc:TRADITIONAL_CLIMBING': ['granite crack climbing', 'Cathedral Ledge climbing', 'New Hampshire rock climbing', 'gritstone trad climber'],
  'disc:SPORT_CLIMBING': ['sport climber limestone crag', 'lead climber clipping bolt outdoor', 'Red River Gorge climbing'],
  'disc:BOULDERING': ['outdoor bouldering granite', 'highball boulder problem', 'forest boulder climber'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OK_LICENSE = /^(CC BY(-SA)?( \d)?|CC0|Public domain|No restrictions)/i;

async function search(term, limit = 14) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search' +
    `&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(term)}` +
    '&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1400';
  const res = await fetch(url, { headers: { 'User-Agent': 'ClimbingCompanion-demo-seed/1.0 (labziminsky@gmail.com)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const pages = (json.query && json.query.pages) || {};
  return Object.values(pages)
    .map((p) => {
      const ii = (p.imageinfo || [])[0] || {};
      const em = ii.extmetadata || {};
      const val = (k) => (em[k] && em[k].value ? String(em[k].value).replace(/<[^>]+>/g, '').trim() : null);
      return {
        title: p.title, mime: ii.mime, width: ii.width, height: ii.height,
        url: ii.thumburl || ii.url, descUrl: ii.descriptionurl,
        license: val('LicenseShortName'), licenseUrl: val('LicenseUrl'),
        artist: val('Artist'), credit: val('Credit'),
      };
    })
    .filter((m) => /^image\/(jpeg|png)$/.test(m.mime || '') && (m.width || 0) >= 700);
}

async function download(m, i) {
  const ext = m.mime === 'image/png' ? 'png' : 'jpg';
  const file = path.join(OUT, `${String(i).padStart(3, '0')}.${ext}`);
  const res = await fetch(m.url, { headers: { 'User-Agent': 'ClimbingCompanion-demo-seed/1.0' } });
  if (!res.ok) throw new Error(`dl ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8000) throw new Error('small');
  fs.writeFileSync(file, buf);
  return { file: path.basename(file), bytes: buf.length };
}

(async () => {
  for (const [pool, terms] of Object.entries(POOLS)) {
    manifest.pools[pool] = manifest.pools[pool] || [];
    for (const term of terms) {
      let results = [];
      try { results = await search(term); } catch (e) { console.warn(`  ! ${term}: ${e.message}`); }
      await sleep(400);
      for (const m of results) {
        if (seen.has(m.title) || !OK_LICENSE.test(m.license || '')) continue;
        if (/\.(pdf|svg|tif)/i.test(m.title)) continue;
        seen.add(m.title);
        try {
          const dl = await download(m, idx);
          manifest.images[dl.file] = {
            id: dl.file, bytes: dl.bytes, mime: m.mime, sourcePool: pool,
            searchTerm: term, title: m.title, descUrl: m.descUrl,
            license: m.license, licenseUrl: m.licenseUrl,
            artist: m.artist || m.credit || 'Unknown (Wikimedia Commons)',
          };
          manifest.pools[pool].push(dl.file);
          console.log(`  [${pool}] ${dl.file}  ${m.title.slice(5, 58)}  (${m.license})`);
          idx += 1;
          await sleep(250);
        } catch (e) { console.warn(`  ! dl ${m.title}: ${e.message}`); }
      }
    }
  }
  fs.writeFileSync(path.join(dir, 'photo-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\ntotal images now: ${Object.keys(manifest.images).length}`);
})();
