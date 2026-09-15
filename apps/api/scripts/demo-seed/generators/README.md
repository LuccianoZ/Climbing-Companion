# Data generators (not part of the seed run)

These produced the vendored `../data/routes.json`, `../data/photo-pools.json`
and `../photos/`. You only need them to **regenerate or extend** the dataset
(different areas, more routes, a fresh photo pull). They need network access and
`jimp` (`npm i jimp@0.22` in a scratch dir — it is not a project dependency).

Pipeline, in order:

| script | in | out | what |
| --- | --- | --- | --- |
| `fetch-openbeta.js` | — | `openbeta-raw.json` | crawls a curated set of NY + Niagara Glen area UUIDs from the OpenBeta GraphQL API |
| `transform.js` | `openbeta-raw.json` | `seed-data.json` | maps grades to canonical ordinals, clusters climbs into crags at 250 m, caps 22/crag, tidies names |
| `fetch-photos.js` + `fetch-photos2.js` | — | `photos/`, `photo-manifest.json` | pulls CC-licensed climbing photos from Wikimedia Commons into per-region / per-discipline pools |
| `curate.js` | `photo-manifest.json` | `photos-final/`, `photo-pools.json`, `PHOTO-ATTRIBUTION.md` | hand-picked keep-list, downscales to 760 px, writes attribution |

Then copy `seed-data.json` → `../data/routes.json`, `photo-pools.json` →
`../data/photo-pools.json`, and `photos-final/*` → `../photos/`.

The area UUIDs and the photo keep-list are inline constants near the top of
`fetch-openbeta.js` and `curate.js` respectively — edit those to change scope.
