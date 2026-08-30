// Deterministic stand-ins for /api/map/*, served to the browser by
// Playwright's request interception (see world.ts). Architecture.md AR-21:
// the UI suite stubs the API rather than driving a live NestJS app and
// Postgres, for reasons specific to what these scenarios assert.
//
// BL-020's criteria are about a VERIFIED pin and an UNVERIFIED pin looking
// different, and BL-021's are about action buttons appearing at 250m and
// not at 350m. Reaching those states through the real backend means
// seeding four distinct verifier accounts with four uploaded photos per
// route just to make one pin change colour -- setup that tests BL-009's
// pipeline all over again, in a suite that is supposed to be testing CSS
// and DOM. The pipeline that produces those states already has its own
// green Cucumber coverage in apps/api (route-verification.feature), and
// the shapes below are pinned to the same MapService interfaces the API
// returns, so a contract drift shows up as a TypeScript error here.
//
// What is deliberately NOT stubbed: Leaflet, the OSM tile requests, the
// browser's Geolocation API, and every line of the app's own code. The
// scenarios run against the real map in a real browser.

import type {
  CragDetail,
  GymDetail,
  MapPin,
  MapSearchResult,
} from '@/lib/types';

export const CRAG_LOCATION = { latitude: 37.7338, longitude: -119.5676 };
export const GYM_LOCATION = { latitude: 37.7351, longitude: -119.5702 };

export const CRAG_ID = '11111111-1111-4111-8111-111111111111';
export const GYM_ID = '22222222-2222-4222-8222-222222222222';
export const ROUTE_ID = '33333333-3333-4333-8333-333333333333';

// ~250m and ~350m due north of the crag: one inside the 300m presence
// radius, one outside it. 1 degree of latitude is ~111,320m, so the offsets
// are 250/111320 and 350/111320 -- straddling the boundary by 50m in each
// direction, well clear of the sub-metre difference between the client's
// haversine and the server's spheroid.
export const IN_RANGE_LOCATION = {
  latitude: CRAG_LOCATION.latitude + 250 / 111_320,
  longitude: CRAG_LOCATION.longitude,
};

export const OUT_OF_RANGE_LOCATION = {
  latitude: CRAG_LOCATION.latitude + 350 / 111_320,
  longitude: CRAG_LOCATION.longitude,
};

export const UNVERIFIED_CRAG_PIN: MapPin = {
  id: CRAG_ID,
  kind: 'CRAG',
  name: 'The Great Wall',
  ...CRAG_LOCATION,
  status: 'UNVERIFIED',
};

export const VERIFIED_GYM_PIN: MapPin = {
  id: GYM_ID,
  kind: 'GYM',
  name: 'Vertical Edge Climbing Gym',
  ...GYM_LOCATION,
  status: 'VERIFIED',
};

export const CRAG_DETAIL: CragDetail = {
  id: CRAG_ID,
  kind: 'CRAG',
  name: 'The Great Wall',
  ...CRAG_LOCATION,
  status: 'UNVERIFIED',
  routes: [
    {
      id: ROUTE_ID,
      name: 'Solar Power',
      discipline: 'SPORT_CLIMBING',
      gearRequirements: ['QUICKDRAWS', 'HELMET'],
      summary: 'Sustained face climbing on good edges, crux at the third bolt.',
      boltCount: 12,
      minRopeLengthM: 60,
      status: 'UNVERIFIED',
      ...CRAG_LOCATION,
      grade: {
        source: 'CONSENSUS',
        gradeOrdinal: 14,
        totalVotes: 5,
        distribution: [
          { gradeOrdinal: 14, voteCount: 3 },
          { gradeOrdinal: 15, voteCount: 2 },
        ],
      },
      verificationCount: 2,
      verificationsRequired: 4,
    },
  ],
};

export const GYM_DETAIL: GymDetail = {
  id: GYM_ID,
  kind: 'GYM',
  name: 'Vertical Edge Climbing Gym',
  ...GYM_LOCATION,
  status: 'VERIFIED',
  disciplinesOffered: ['BOULDERING', 'LEAD'],
};

// Deliberately far from the map's default centre so a successful fly-to is
// unambiguous: if the map did not move, this location is nowhere near the
// viewport it started in.
export const SEARCH_TARGET: MapSearchResult = {
  id: GYM_ID,
  kind: 'GYM',
  name: 'Vertical Edge Climbing Gym',
  latitude: 42.8864,
  longitude: -78.8784,
  status: 'VERIFIED',
  cragId: null,
};
