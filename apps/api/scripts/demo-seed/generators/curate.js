// Curate the fetched Wikimedia pool: keep only real climbing / correct-area
// photos, downscale to <=1600px JPEG, emit photo-pools.json + attribution.
const fs = require('fs');
const path = require('path');
const J = require('jimp');
const dir = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'photo-manifest.json'), 'utf8'));
const SRC = path.join(dir, 'photos');
const DST = path.join(dir, 'photos-final');
fs.mkdirSync(DST, { recursive: true });

// Hand-picked after reviewing the contact sheets. Keys are the pool a photo
// serves; a photo can appear in more than one pool.
const KEEP = {
  gunks: ['001', '002', '003', '005', '006', '007', '008', '077', '080', '081'],
  adirondacks: ['011', '012', '013', '070', '071'],
  'central park': ['014', '015', '016', '022'],
  'little falls': ['107', '111', '119'],
  'niagara glen': ['083', '084', '085', '086', '087', '088', '030', '031', '033'],
  powerlinez: ['119', '120', '065', '066', '061'],
  'disc:TRADITIONAL_CLIMBING': ['037', '038', '039', '040', '041', '042', '043', '044', '045', '046', '107'],
  'disc:SPORT_CLIMBING': ['048', '053', '054', '055', '056', '104', '111', '115', '116'],
  'disc:BOULDERING': ['061', '062', '063', '065', '066', '119', '120'],
  generic: ['068', '069', '070', '071', '073', '074', '075', '004', '052'],
};

const byNum = {};
for (const [id, meta] of Object.entries(manifest.images)) byNum[id.split('.')[0]] = { id, meta };

(async () => {
  const allNums = [...new Set(Object.values(KEEP).flat())];
  const finalMeta = {};
  for (const num of allNums) {
    const rec = byNum[num];
    if (!rec) {
      console.warn(`  ! no image for ${num}`);
      continue;
    }
    const srcFile = path.join(SRC, rec.id);
    try {
      const im = await J.read(srcFile);
      if (im.bitmap.width > 760) im.resize(760, J.AUTO);
      im.quality(70);
      const out = `${num}.jpg`;
      await im.writeAsync(path.join(DST, out));
      const bytes = fs.statSync(path.join(DST, out)).size;
      finalMeta[num] = {
        file: out,
        bytes,
        title: rec.meta.title.replace(/^File:/, ''),
        descUrl: rec.meta.descUrl,
        license: rec.meta.license,
        licenseUrl: rec.meta.licenseUrl,
        artist: rec.meta.artist,
      };
      console.log(`  ${out}  ${(bytes / 1024).toFixed(0)}KB  ${finalMeta[num].title.slice(0, 50)}`);
    } catch (e) {
      console.warn(`  ! ${num}: ${e.message}`);
    }
  }

  const pools = {};
  for (const [pool, nums] of Object.entries(KEEP)) {
    pools[pool] = nums.filter((n) => finalMeta[n]).map((n) => finalMeta[n].file);
  }

  fs.writeFileSync(
    path.join(dir, 'photo-pools.json'),
    JSON.stringify({ pools, images: finalMeta }, null, 2),
  );

  // human-readable attribution
  const lines = ['# Photo attribution — demo seed route photos', '',
    'All images from Wikimedia Commons, used under the stated license.', ''];
  for (const [num, m] of Object.entries(finalMeta).sort()) {
    lines.push(`- **${m.file}** — "${m.title}" by ${m.artist}. ${m.license}. ${m.descUrl}`);
  }
  fs.writeFileSync(path.join(dir, 'PHOTO-ATTRIBUTION.md'), lines.join('\n') + '\n');

  console.log(`\n${Object.keys(finalMeta).length} images kept`);
  for (const [p, f] of Object.entries(pools)) console.log(`  ${p}: ${f.length}`);
  const totalMB = Object.values(finalMeta).reduce((s, m) => s + m.bytes, 0) / 1e6;
  console.log(`pool size: ${totalMB.toFixed(1)}MB`);
})();
