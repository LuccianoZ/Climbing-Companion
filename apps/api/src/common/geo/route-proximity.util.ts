import { EntityManager } from 'typeorm';

// Architecture.md AR-18: the 300m constant shared by every "is this
// verifying user's own live location within range of a routes/gyms row"
// check across the codebase (Foundation §5/§6/§7) -- BL-009/BL-011's
// VerificationService keeps its own private copy (VERIFICATION_PROXIMITY_METERS)
// rather than importing this one, deliberately: refactoring that
// already-green, user-verified class's constructor to take a new injected
// dependency isn't something this thread can safely re-verify without
// being able to run Vitest itself this session (the device bridge can't
// run `vitest run` -- see every prior handoff's gotcha list). This
// constant/function pair exists so Epic 3's two new 300m-gated call sites
// (BL-015 grade voting, BL-017/018 climb logging) don't each duplicate the
// same raw ST_DWithin SQL a third and fourth time. Collapsing all of it
// into one shared, injectable GeoProximityService is flagged as a
// worthwhile later cleanup, not silently skipped.
export const STANDARD_PROXIMITY_METERS = 300;

export interface ProximityLocation {
  latitude: number;
  longitude: number;
}

// Same PostGIS shape as VerificationService.isWithinRange: explicit
// ::float8/::uuid casts on every raw bind parameter, required because
// manager.query()'s parameterized SQL sends numeric binds with an
// unresolved type and ST_DWithin/ST_MakePoint have overloads that collide
// on that (see Architecture.md AR-16/AR-17 for the full "function ... is
// not unique" story). `table` is never user-supplied -- always one of the
// two literal values callers pass -- so string interpolation here carries
// no injection risk and isn't parameterizable the normal way since a bind
// parameter can't stand in for an identifier.
export async function isWithinProximity(
  manager: EntityManager,
  table: 'routes' | 'gyms',
  entityId: string,
  location: ProximityLocation,
  radiusMeters: number = STANDARD_PROXIMITY_METERS,
): Promise<boolean> {
  const rows: Array<{ within: boolean }> = await manager.query(
    `SELECT ST_DWithin(
       "location",
       ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography,
       $3::float8
     ) AS within
     FROM "${table}"
     WHERE "id" = $4::uuid`,
    [location.longitude, location.latitude, radiusMeters, entityId],
  );
  return rows[0]?.within === true;
}
