import type { MapPin } from '@/lib/types';

// BL-x13 (Sept 9, 2026) -- tiered pins + density clustering.
//
// Foundation §4 renders one pin per CRAG, justified explicitly by density:
// "rendering one pin per route would make a popular area an unreadable marker
// cluster." That reasoning is about what the map can legibly draw, not about
// what a route is -- so this module answers the density problem directly and
// lets routes have their own pins once there is room for them. The crag keeps
// every job §4/§5 gave it (it is still the lifecycle entity, still the thing
// the founding-route cascade verifies and archives); it simply stops being the
// only tier the map can render.
//
// Three tiers, one per zoom band:
//
//   zoom < ROUTE_TIER_MIN_ZOOM   crag pins + gym pins
//   zoom >= ROUTE_TIER_MIN_ZOOM  route pins + gym pins  (crags expand)
//
// and clustering runs over whichever set is current, so the two mechanisms
// compose instead of competing: a cluster is geographic and ephemeral, a crag
// is semantic and persistent, and they never represent the same grouping at
// the same moment.
//
// Deliberately dependency-free. leaflet.markercluster would do the geometry,
// but it owns marker creation, which would mean giving up the divIcon contract
// pin-icons.ts publishes and the BDD suite asserts against
// (data-testid/data-pin-* on real DOM). The clustering itself is ~40 lines;
// the integration cost of the plugin is larger than the algorithm.

export const ROUTE_TIER_MIN_ZOOM = 16;

// Cluster radius in SCREEN PIXELS, not metres -- overlap is a screen problem,
// and a metre radius would cluster differently at every zoom for no reason.
//
// 70px is chosen against two fixed facts: pin-icons.ts builds markers at
// iconSize [150, 60], and features/support/fixtures.ts deliberately separates
// its two fixture pins by ~184px at zoom 12 so Playwright can click them
// unobstructed. A radius below that separation leaves every existing UI
// scenario rendering exactly the pins it already expects.
export const CLUSTER_RADIUS_PX = 70;

export interface PinCluster {
  id: string;
  latitude: number;
  longitude: number;
  pins: MapPin[];
  // Counts are of CLIMBS and GYMS -- never of crags. A crag contributes its
  // routeCount, a route contributes itself, so "23 climbs" stays 23 climbs
  // when the crag tier expands into the route tier under the climber's
  // fingers. Counting pins instead would make the number jump on zoom and
  // read as a bug.
  climbCount: number;
  gymCount: number;
}

export type MapEntry =
  | { type: 'PIN'; pin: MapPin }
  | { type: 'CLUSTER'; cluster: PinCluster };

// Web Mercator (EPSG:3857) at Leaflet's 256px tile size, which is what
// map.project(latlng, zoom) returns. Reimplemented rather than called so this
// module stays free of the `leaflet` import -- that package touches `window`
// at import time (BL-019 / §20.1), and clustering is pure geometry that both
// the unit tests and any future server-side caller should be able to run.
function projectToPixels(
  latitude: number,
  longitude: number,
  zoom: number,
): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * scale,
    y:
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function climbsOn(pin: MapPin): number {
  if (pin.kind === 'ROUTE') {
    return 1;
  }
  if (pin.kind === 'CRAG') {
    // A crag the API rendered always has at least one non-archived route
    // (AR-14/AR-17's EXISTS clause), so a missing or zero count is a payload
    // anomaly rather than an empty crag -- floor at 1 so the cluster total
    // never under-reports what a climber will find on expanding it.
    return Math.max(pin.routeCount ?? 1, 1);
  }
  return 0;
}

/**
 * Picks which tier of pins is current for a zoom level.
 *
 * A crag expands into its routes only when route pins for it are actually
 * present. That is not a test accommodation but the correct degradation: if
 * the payload carries no children for a crag -- an older API, a stubbed
 * fixture, a partial response -- replacing the crag pin with nothing would
 * erase it from the map. Showing the coarser tier is always safe.
 */
export function selectTier(pins: MapPin[], zoom: number): MapPin[] {
  const gyms = pins.filter((pin) => pin.kind === 'GYM');
  const crags = pins.filter((pin) => pin.kind === 'CRAG');
  const routes = pins.filter((pin) => pin.kind === 'ROUTE');

  if (zoom < ROUTE_TIER_MIN_ZOOM) {
    return [...crags, ...gyms];
  }

  const expanded = new Set(routes.map((route) => route.cragId));
  return [
    ...crags.filter((crag) => !expanded.has(crag.id)),
    ...gyms,
    ...routes,
  ];
}

/**
 * Greedy single-pass clustering in projected pixel space.
 *
 * Greedy-nearest rather than a grid: a grid is one line shorter but splits any
 * two pins that straddle a cell boundary, which shows up as two "1" clusters
 * sitting on top of each other -- the exact artefact clustering exists to
 * remove. O(n*k) in pins by clusters, which at MVP scale (§20.2, ~20-25 users,
 * a demo dataset) is nothing.
 *
 * Input order is normalised by id so the same pins always produce the same
 * clusters; without it, React would see reordered keys and rebuild markers
 * mid-assertion.
 */
export function clusterPins(pins: MapPin[], zoom: number): MapEntry[] {
  const ordered = [...pins].sort((a, b) => a.id.localeCompare(b.id));

  const groups: Array<{ pins: MapPin[]; x: number; y: number }> = [];

  for (const pin of ordered) {
    const point = projectToPixels(pin.latitude, pin.longitude, zoom);
    const home = groups.find(
      (group) => Math.hypot(group.x - point.x, group.y - point.y) <= CLUSTER_RADIUS_PX,
    );

    if (home) {
      // Running mean, so a cluster's anchor drifts to the centre of what it
      // actually holds rather than pinning to whichever member happened to be
      // read first.
      home.x = (home.x * home.pins.length + point.x) / (home.pins.length + 1);
      home.y = (home.y * home.pins.length + point.y) / (home.pins.length + 1);
      home.pins.push(pin);
    } else {
      groups.push({ pins: [pin], x: point.x, y: point.y });
    }
  }

  return groups.map((group) => {
    if (group.pins.length === 1) {
      return { type: 'PIN', pin: group.pins[0] } as const;
    }

    // Anchored on the mean of the members' real coordinates rather than by
    // un-projecting the pixel centroid: same place to within a pixel, and it
    // keeps the returned lat/lng honest at any zoom.
    const latitude =
      group.pins.reduce((sum, pin) => sum + pin.latitude, 0) / group.pins.length;
    const longitude =
      group.pins.reduce((sum, pin) => sum + pin.longitude, 0) / group.pins.length;

    return {
      type: 'CLUSTER',
      cluster: {
        id: `cluster:${group.pins.map((pin) => pin.id).join('|')}`,
        latitude,
        longitude,
        pins: group.pins,
        climbCount: group.pins.reduce((sum, pin) => sum + climbsOn(pin), 0),
        gymCount: group.pins.filter((pin) => pin.kind === 'GYM').length,
      },
    } as const;
  });
}

/**
 * The zoom that will break a cluster apart, for click-to-expand.
 *
 * Leaflet clamps to the layer's own maxZoom, so overshooting the top of the
 * range is harmless; +2 is enough to separate all but genuinely co-located
 * pins in one step, and a cluster of pins at literally identical coordinates
 * is expanded by opening it, not by zooming further.
 */
export function zoomToBreak(zoom: number): number {
  return Math.min(zoom + 2, 19);
}
