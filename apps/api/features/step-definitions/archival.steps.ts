import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { ArchivalService } from '../../src/archival/archival.service';
import { RoutesService } from '../../src/routes/routes.service';

// BL-013 -- Architecture.md §9/§19.5: ArchivalService.
// archiveExpiredUnverifiedItems() is a plain, directly-callable method --
// reached in-process here (no HTTP endpoint exists, same convention as
// route-submission.steps.ts's "the visible crags for the map are queried"
// step reaching RoutesService directly, AR-14). Every fixture below
// backdates created_at with a fixed, generous offset (1 day) rather than
// sleeping past the configured ARCHIVAL_WINDOW_MS -- keeps the suite fast
// and correct regardless of whether that value is 5000ms (.env.test) or
// something else.

async function findUserId(
  dataSource: DataSource,
  email: string,
): Promise<string> {
  const [user] = await dataSource.query(
    'SELECT id FROM users WHERE email = $1',
    [email],
  );
  assert.ok(user?.id, `expected a registered user ${email}`);
  return user.id as string;
}

When('the archival job runs', async function (this: AuthWorld) {
  const archivalService = this.app.get(ArchivalService);
  this.archivalResult = await archivalService.archiveExpiredUnverifiedItems();
});

Then(
  'the archival job completes with numeric route, gym, and crag counts',
  function (this: AuthWorld) {
    assert.ok(this.archivalResult, 'expected a prior "the archival job runs" step');
    assert.equal(typeof this.archivalResult!.routesArchived, 'number');
    assert.equal(typeof this.archivalResult!.gymsArchived, 'number');
    assert.equal(typeof this.archivalResult!.cragsArchived, 'number');
  },
);

Given(
  'route {string} is well past the archival window',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE routes SET created_at = now() - interval '1 day' WHERE name = $1`,
      [routeName],
    );
  },
);

Given(
  'gym {string} is well past the archival window',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE gyms SET created_at = now() - interval '1 day' WHERE name = $1`,
      [gymName],
    );
  },
);

Given(
  'route {string} is VERIFIED and well past the archival window',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE routes
       SET status = 'VERIFIED', verified_at = now(), created_at = now() - interval '1 day'
       WHERE name = $1`,
      [routeName],
    );
  },
);

Given(
  'gym {string} is VERIFIED and well past the archival window',
  async function (this: AuthWorld, gymName: string) {
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE gyms
       SET status = 'VERIFIED', verified_at = now(), created_at = now() - interval '1 day'
       WHERE name = $1`,
      [gymName],
    );
  },
);

// TestInventory.md §3.3's mandated crag-cascade Gherkin, reproduced
// verbatim rather than re-derived (per the BL-011/012/013 handoff). No
// lat/lng is given in that Gherkin -- fixed coordinates are used since the
// scenario only cares about the crag/route/verification-count
// relationships, not real-world placement.
Given(
  'crag {string} is UNVERIFIED with founding route {string}',
  async function (
    this: AuthWorld,
    cragName: string,
    foundingRouteName: string,
  ) {
    const dataSource = this.app.get(DataSource);
    const submitterId = await findUserId(dataSource, 'sam@example.com');

    const [crag] = await dataSource.query(
      `INSERT INTO crags (name, location, created_by)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
       RETURNING id`,
      [cragName, -78.95, 42.95, submitterId],
    );
    const [route] = await dataSource.query(
      `INSERT INTO routes
         (crag_id, name, location, discipline, summary, proposed_grade_ordinal, submitted_by)
       VALUES
         ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 'SPORT_CLIMBING',
          'Seeded founding route for an archival BDD scenario.', 8, $5)
       RETURNING id`,
      [crag.id, foundingRouteName, -78.95, 42.95, submitterId],
    );
    await dataSource.query(`UPDATE crags SET founding_route_id = $1 WHERE id = $2`, [
      route.id,
      crag.id,
    ]);

    this.lastCragId = crag.id as string;
  },
);

Given(
  'sibling route {string} under the same crag is already VERIFIED',
  async function (this: AuthWorld, siblingRouteName: string) {
    assert.ok(
      this.lastCragId,
      'expected a prior "crag ... is UNVERIFIED with founding route ..." step',
    );
    const dataSource = this.app.get(DataSource);
    const submitterId = await findUserId(dataSource, 'sam@example.com');

    await dataSource.query(
      `INSERT INTO routes
         (crag_id, name, location, discipline, summary, proposed_grade_ordinal, submitted_by, status, verified_at)
       VALUES
         ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 'BOULDERING',
          'Seeded VERIFIED sibling route for an archival BDD scenario.', 5, $5, 'VERIFIED', now())`,
      [this.lastCragId, siblingRouteName, -78.951, 42.951, submitterId],
    );
  },
);

Given(
  '{string} has not reached 4 verifications within the archival window',
  async function (this: AuthWorld, routeName: string) {
    // Zero verifications is already the seeded default -- all this step
    // needs to guarantee is that the route is old enough for the archival
    // job to consider it a candidate.
    const dataSource = this.app.get(DataSource);
    await dataSource.query(
      `UPDATE routes SET created_at = now() - interval '1 day' WHERE name = $1`,
      [routeName],
    );
  },
);

// Generic by design: checks routes, then crags, then gyms by name, since
// the mandated Gherkin (TestInventory §3.3) uses the same step wording for
// both a route ("Warmup Wall") and a crag ("Devil's Hole") interchangeably.
async function findStatusByName(
  dataSource: DataSource,
  name: string,
): Promise<string> {
  const [route] = await dataSource.query(
    'SELECT status FROM routes WHERE name = $1',
    [name],
  );
  if (route) {
    return route.status as string;
  }
  const [crag] = await dataSource.query(
    'SELECT status FROM crags WHERE name = $1',
    [name],
  );
  if (crag) {
    return crag.status as string;
  }
  const [gym] = await dataSource.query(
    'SELECT status FROM gyms WHERE name = $1',
    [name],
  );
  assert.ok(gym, `expected a route, crag, or gym named "${name}"`);
  return gym.status as string;
}

Then(
  '{string} status becomes ARCHIVED',
  async function (this: AuthWorld, name: string) {
    const dataSource = this.app.get(DataSource);
    assert.equal(await findStatusByName(dataSource, name), 'ARCHIVED');
  },
);

Then(
  '{string} status remains VERIFIED',
  async function (this: AuthWorld, name: string) {
    const dataSource = this.app.get(DataSource);
    assert.equal(await findStatusByName(dataSource, name), 'VERIFIED');
  },
);

Then(
  '{string} status remains VERIFIED, unreachable via the map since its parent crag is archived',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const [route] = await dataSource.query(
      'SELECT status FROM routes WHERE name = $1',
      [routeName],
    );
    assert.ok(route, `expected a route named "${routeName}"`);
    assert.equal(route.status, 'VERIFIED');

    const [crag] = await dataSource.query(
      `SELECT c.name FROM crags c JOIN routes r ON r.crag_id = c.id WHERE r.name = $1`,
      [routeName],
    );
    assert.ok(crag, `expected "${routeName}" to belong to a crag`);

    const routesService = this.app.get(RoutesService);
    const visibleCrags = await routesService.findVisibleCrags();
    const found = visibleCrags.some((c) => c.name === (crag.name as string));
    assert.equal(
      found,
      false,
      `expected "${crag.name as string}" (parent of "${routeName}") to be excluded from visible crags`,
    );
  },
);

