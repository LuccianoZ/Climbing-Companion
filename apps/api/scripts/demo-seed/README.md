# Demo data seeder

Fills a **dedicated demo database** with realistic outdoor-climbing data so the
app looks lived-in for a demo: ~237 real New York + Niagara Glen climbs, ~50
data-only fake climbers, an admin account, and one showcase "demo user" with a
deep climb-log history that exercises every analytics chart.

The seed writes **only** to the database URL you pass it and makes **no network
calls** — all route data and photos are vendored under `data/` and `photos/`.

---

> **Already done for you:** `climbing_companion_demo` has been created, migrated,
> and seeded. If you just want to use it, skip to **step 3**. Steps 1–2 are for
> rebuilding it from scratch.

The seed URL used throughout:
`postgres://climb:climbing_dev_password@127.0.0.1:5432/climbing_companion_demo`

## 1. One-time: create + migrate the demo database

```bash
# create the database
docker exec -i climbing-companion-db psql -U climb -d postgres \
  -c "CREATE DATABASE climbing_companion_demo OWNER climb;"
```

Run every migration against it. **This project's dotenv setup overrides
`process.env` from `.env`**, so `DATABASE_URL=… npm run migration:run` still hits
the dev DB — you must edit `.env` for the migration run, then switch it back:

```bash
# bash / WSL — from apps/api
cp .env .env.bak
sed -i 's#/climbing_companion$#/climbing_companion_demo#' .env
npm run migration:run
mv .env.bak .env
```
```powershell
# PowerShell — from apps\api
Copy-Item .env .env.bak
(Get-Content .env) -replace '/climbing_companion$', '/climbing_companion_demo' | Set-Content .env
npm run migration:run
Move-Item -Force .env.bak .env
```

## 2. Seed it

```bash
# from apps/api — same in bash and PowerShell
node scripts/demo-seed/seed.js "postgres://climb:climbing_dev_password@127.0.0.1:5432/climbing_companion_demo"
```

Takes ~10–15 s (most of it the closing `VACUUM FULL`). Refuses to run against
`climbing_companion` / `climbing_companion_test`, and refuses to run twice (tear
down first).

## 3. Point the app at the demo DB (and back)

The app reads `DATABASE_URL` from `apps/api/.env`. Web talks to the API, not the
DB, so only the API needs a restart.

```bash
# bash / WSL — from apps/api
cp .env .env.dev.bak
sed -i 's#/climbing_companion$#/climbing_companion_demo#' .env
# restart the API. To go back:  mv .env.dev.bak .env  (and restart)
```
```powershell
# PowerShell — from apps\api
Copy-Item .env .env.dev.bak
(Get-Content .env) -replace '/climbing_companion$', '/climbing_companion_demo' | Set-Content .env
# restart the API. To go back:  Move-Item -Force .env.dev.bak .env  (and restart)
```

Your dev database is never touched by any of this.

## 4. Tear it down

```bash
# from apps/api — same in bash and PowerShell
node scripts/demo-seed/teardown.js "postgres://climb:climbing_dev_password@127.0.0.1:5432/climbing_companion_demo"
```

Scoped delete: removes every seeded user (`labziminsky@gmail.com`,
`alex.demo@…`, and the `@seed.demo.invalid` domain) and everything they created —
all crags, routes, photos, votes, verifications, logs, reviews, friendships,
notifications. **It deliberately leaves gym data alone**, so if you add gyms to
the demo DB they survive a teardown + re-seed. (A seed user that has authored a
gym is kept rather than deleted.)

---

## Credentials

| Account | Email | Password |
| --- | --- | --- |
| Admin (`SYSTEM_ADMIN`) | `labziminsky@gmail.com` | `ClimbingIsFun2010$` |
| Demo user (`VERIFIED_USER`) | `alex.demo@climbingcompanion.app` | `DemoClimber2026!` |

The ~50 fake climbers are **data only** — they have an unusable password hash and
cannot log in.

The seed prints two single-use **friend-invite tokens** each run (they change per
run): one authored by a fake climber, one by the demo user. Redeem
`/friend-invite-links/<token>/redeem` while signed in to demo the friend flow.

## What gets created

| | count |
| --- | --- |
| users | 52 (admin + demo + 50 fake) |
| crags | 17 (real NY + Niagara Glen areas) |
| routes | 237 (144 trad / 79 boulder / 14 sport) |
| media_assets | ~1440 (3 approved submission photos per route + verification photos) |
| route_verifications | ~700 |
| route_grade_votes | ~1260 |
| climb_logs | ~890 (incl. ~60 for the demo user, spread over ~8 months with a difficulty progression) |
| reviews | ~130 |
| friendships | ~46 |

~115 of the 237 routes are **Verified by Community** (4+ verifications, crag
cascaded); the rest are unverified with partial progress. Consensus grades mostly
confirm the guidebook grade, ~40 % differ by a rung, a few by more.

Demo-user analytics: all three disciplines populated, completed + attempted
series, per-discipline completion rate < 100 %, grade distribution spanning
roughly 5.4–5.12 (trad), VB–V6 (boulder), 5.10–5.13 (sport).

Crags: The Gunks (Trapps, Near Trapps, Peterskill, Trapps Bouldering),
Adirondacks (Poke-O-Moonshine, Chapel Pond Pass ×4, Shelving Rock ×2),
Powerlinez (Welcome Boulders, Shakedown Street), Central Park (Rat Rock),
Little Falls, Niagara Glen. Every climb keeps its **real GPS coordinate** from
OpenBeta; crags are proximity-clustered at 250 m so they never overlap the
300 m crag rule.

## Data provenance

- **Routes / crags / grades / coordinates** — [OpenBeta](https://openbeta.io)
  GraphQL API, CC-BY-SA 4.0. Route summaries are synthesised (OpenBeta's
  descriptions are mostly empty); grades are mapped to Climbing Companion's
  canonical ordinals.
- **Photos** — Wikimedia Commons, each under a CC-BY / CC-BY-SA / CC0 / public
  domain license. Full per-file attribution in `PHOTO-ATTRIBUTION.md`.

  **Honest limitation:** true per-route photos do not exist in any open source
  (OpenBeta had ~15 usable images for these 237 routes; Mountain Project's are
  copyrighted). The 62-image pool is assigned **by area then by discipline** —
  Gunks routes show real Gunks cliffs, Niagara Glen shows real Niagara Glen
  boulders, Rat Rock shows Rat Rock; everything else shows a real climbing photo
  matching the route's discipline (trad → crack climbing, sport → bolted crag,
  boulder → bouldering). Photos repeat within a crag. It reads as cohesive, not
  as "this exact line."

## Notes / gotchas

- **Demo DB size ≈ 250 MB**, almost entirely photo `BYTEA` (Foundation §21
  risk 3, in miniature). Fine on disk; switching DBs is just an env var, no
  dump/restore.
- This project's dotenv **overrides `process.env`** — inline `DATABASE_URL=…` in
  front of an `npm` script does not work; edit `.env` instead (see above).
- Validated at the query level against the real service SQL (map pins, crag
  detail, `computeConsensus`, approved-photo gallery, analytics aggregation,
  geography→GeoJSON, FK integrity). Give it a visual pass in your normal
  `npm run dev` once pointed at the demo DB.
- Regeneration scripts for the vendored `data/` (OpenBeta crawl, grade mapping,
  Wikimedia photo fetch + curation) live in `generators/` — you only need them to
  change scope (different areas, more routes). The seed itself runs fully offline
  from the committed outputs.
