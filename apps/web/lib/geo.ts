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
