import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { AuthWorld } from '../support/world';
import { RoutesService } from '../../src/routes/routes.service';
import {
  findUserIdByEmail,
  seedSubmissionPhotoIds,
} from '../support/seed';

const NUMERIC_FIELDS = new Set(['proposedGradeOrdinal', 'boltCount', 'minRopeLengthM']);

// A blank table cell means the field is omitted from the request body
// entirely (true "missing", not an empty string/zero) -- this is what lets
// the same step drive both the mandatory-field-rejection scenario and the
// bolt/rope Scenario Outline's blank cells for the discipline that doesn't
// apply.
function buildRouteDetails(table: DataTable): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [field, rawValue] of table.raw()) {
    if (rawValue === '' || rawValue === undefined) {
      continue;
    }
    if (field === 'gearRequirements') {
      details[field] = rawValue.split(',').map((v) => v.trim());
      continue;
    }
    details[field] = NUMERIC_FIELDS.has(field) ? Number(rawValue) : rawValue;
  }
  return details;
}

When(
  '{string} submits a route named {string} at latitude {float}, longitude {float} with these details:',
  async function (
    this: AuthWorld,
    email: string,
    name: string,
    latitude: number,
    longitude: number,
    table: DataTable,
  ) {
    // AR-51 BL-x05: a route submission now needs >= 3 pre-uploaded
    // ROUTE_SUBMISSION_PHOTO ids. Seeded transparently here so the ~7 other
    // features that submit a route through this step keep working; the
    // >= 3 rule itself is exercised in gym-submission-and-verification.feature.
    // The proximity gate (BL-x02) is not hit: with no X-Test-Mock-GPS and no
    // device fields, the controller uses the pin coords as the device
    // location, so distance is 0.
    const dataSource = this.app.get(DataSource);
    const submitterId = await findUserIdByEmail(dataSource, email);
    const photoMediaIds = await seedSubmissionPhotoIds(
      dataSource,
      submitterId,
      'ROUTE_SUBMISSION_PHOTO',
    );

    this.response = await this.http
      .post('/api/routes')
      .set('Cookie', this.sessionCookie)
      .send({
        name,
        latitude,
        longitude,
        photoMediaIds,
        ...buildRouteDetails(table),
      });
  },
);

Then('the submission succeeds', function (this: AuthWorld) {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
});

Then('the submission is rejected as a validation error', function (this: AuthWorld) {
  assert.equal(this.response.status, 400, JSON.stringify(this.response.body));
});

Then(
  'a new crag is created whose founding route is {string}',
  async function (this: AuthWorld, routeName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT c.founding_route_id, r.id AS route_id
       FROM crags c
       JOIN routes r ON r.id = c.founding_route_id
       WHERE r.name = $1`,
      [routeName],
    );
    assert.equal(rows.length, 1, `expected exactly one crag founded by "${routeName}"`);
    assert.equal(rows[0].founding_route_id, rows[0].route_id);
  },
);

// Seeds a crag + its founding route directly via SQL, bypassing the HTTP
// submission flow -- this is Background-style fixture setup for scenarios
// that need a pre-existing crag, not the behavior under test. Relies on the
// Background having already registered "alex@example.com".
Given(
  'a crag {string} already exists at latitude {float}, longitude {float} with founding route {string}',
  async function (
    this: AuthWorld,
    cragName: string,
    latitude: number,
    longitude: number,
    foundingRouteName: string,
  ) {
    const dataSource = this.app.get(DataSource);
    const [seedUser] = await dataSource.query(
      `SELECT id FROM users WHERE email = 'alex@example.com'`,
    );
    assert.ok(
      seedUser?.id,
      'expected the Background to have registered alex@example.com before this step',
    );

    const [crag] = await dataSource.query(
      `INSERT INTO crags (name, location, created_by)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
       RETURNING id`,
      [cragName, longitude, latitude, seedUser.id],
    );
    const [route] = await dataSource.query(
      `INSERT INTO routes
         (crag_id, name, location, discipline, summary, proposed_grade_ordinal, submitted_by)
       VALUES
         ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 'SPORT_CLIMBING',
          'Seeded founding route for a BDD scenario.', 8, $5)
       RETURNING id`,
      [crag.id, foundingRouteName, longitude, latitude, seedUser.id],
    );
    await dataSource.query(`UPDATE crags SET founding_route_id = $1 WHERE id = $2`, [
      route.id,
      crag.id,
    ]);
  },
);

Then(
  '{string} is attached to crag {string} as a non-founding child',
  async function (this: AuthWorld, routeName: string, cragName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT r.id AS route_id, c.founding_route_id
       FROM routes r
       JOIN crags c ON c.id = r.crag_id
       WHERE r.name = $1 AND c.name = $2`,
      [routeName, cragName],
    );
    assert.equal(rows.length, 1, `expected "${routeName}" to belong to crag "${cragName}"`);
    assert.notEqual(rows[0].founding_route_id, rows[0].route_id);
  },
);

Then(
  'crag {string} is still UNVERIFIED with founding route {string}',
  async function (this: AuthWorld, cragName: string, foundingRouteName: string) {
    const dataSource = this.app.get(DataSource);
    const rows = await dataSource.query(
      `SELECT c.status, r.name AS founding_route_name
       FROM crags c
       JOIN routes r ON r.id = c.founding_route_id
       WHERE c.name = $1`,
      [cragName],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'UNVERIFIED');
    assert.equal(rows[0].founding_route_name, foundingRouteName);
  },
);

Given('every route under crag {string} is ARCHIVED', async function (this: AuthWorld, cragName: string) {
  const dataSource = this.app.get(DataSource);
  await dataSource.query(
    `UPDATE routes SET status = 'ARCHIVED', archived_at = now()
     WHERE crag_id = (SELECT id FROM crags WHERE name = $1)`,
    [cragName],
  );
});

// No map-query HTTP endpoint exists yet (BL-019-023, Sprint 2's Map &
// Search epic) -- BL-006's own AC only requires the underlying query to
// exclude these crags, so this reaches RoutesService directly rather than
// inventing a premature /api/... route ahead of that epic. See
// Architecture.md AR-14.
When('the visible crags for the map are queried', async function (this: AuthWorld) {
  const routesService = this.app.get(RoutesService);
  this.visibleCrags = await routesService.findVisibleCrags();
});

Then('crag {string} is not among them', function (this: AuthWorld, cragName: string) {
  assert.ok(this.visibleCrags, 'expected a prior "visible crags" query step');
  const found = this.visibleCrags!.some((c) => (c as { name: string }).name === cragName);
  assert.equal(found, false, `expected "${cragName}" to be excluded from visible crags`);
});
