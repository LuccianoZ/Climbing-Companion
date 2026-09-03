// The 300m presence radius (Foundation §5/§6/§7). The server is
// authoritative -- every gated action re-checks with PostGIS ST_DWithin
// (common/geo/route-proximity.util.ts) and rejects with a proximity error
// regardless of what the client believed. This constant exists only so the
// UI can show the right affordance before the user taps: BL-021's
// acceptance criterion is that in-range action buttons *appear* only within
// 300m, which is a rendering decision the client has to make locally.
export const PROXIMITY_METERS = 300;

const EARTH_RADIUS_M = 6_371_008.8;

// Haversine rather than a PostGIS round trip: the panel re-computes this on
// every geolocation update, and a network call per GPS tick to answer a
// question the server will re-answer authoritatively anyway would be
// wasteful. Haversine's sphere approximation is worth ~0.3% against
// PostGIS's spheroid at these distances -- under a metre at 300m, which
// cannot flip the decision except within a metre of the boundary, where the
// server's answer governs regardless.
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function isWithinProximity(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  radiusMeters: number = PROXIMITY_METERS,
): boolean {
  return distanceMeters(a, b) <= radiusMeters;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

// AR-51 BL-x02: the submission mini-map lets a non-admin drag the pin only
// inside a 300m circle around their device location; a drag past the edge
// snaps back to the boundary. Given a centre, a target and a radius, this
// returns the target unchanged if it is already inside, or the closest point
// on the circle if it is outside -- computed as "walk `radius` metres from
// the centre along the bearing to the target". Same spherical model as
// distanceMeters (under a metre off at this scale, and the server's
// ST_DWithin governs the actual accept/reject anyway).
export function clampToRadius(
  centre: { latitude: number; longitude: number },
  target: { latitude: number; longitude: number },
  radiusMeters: number = PROXIMITY_METERS,
): { latitude: number; longitude: number } {
  if (distanceMeters(centre, target) <= radiusMeters) {
    return target;
  }

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const lat1 = toRad(centre.latitude);
  const lng1 = toRad(centre.longitude);
  const lat2 = toRad(target.latitude);
  const lng2 = toRad(target.longitude);

  const dLng = lng2 - lng1;
  const bearing = Math.atan2(
    Math.sin(dLng) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng),
  );

  const angular = radiusMeters / EARTH_RADIUS_M;
  const lat = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat),
    );

  return { latitude: toDeg(lat), longitude: toDeg(lng) };
}
