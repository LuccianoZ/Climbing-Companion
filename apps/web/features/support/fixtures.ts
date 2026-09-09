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

// Fixture pins have to be separated in *pixels*, not in metres, and the
// margin needed is far larger than it looks. pin-icons.ts builds each marker
// at `iconSize: [140, 52]` -- the icon is not just the pin glyph, it carries
// BL-020's "Unverified by Community" badge beside it -- so two markers less
// than ~140px apart overlap, and Leaflet z-orders markers by latitude, which
// means the southern one silently covers the northern one.
//
// Playwright will not click an obstructed element: it waits for the hit
// target to be the element it was asked for and then times out, which reads
// as a mysteriously slow page rather than as an overlap. At the map's default
// zoom 12 (~30m per pixel at this latitude) 140px is ~4.2km, so the fixture
// pins sit ~5.5km apart -- ~184px, comfortably clear, and still well inside
// the 390x844 viewport these scenarios run at.
//
// This gym was originally ~270m from the crag, or about 9 pixels. It has
// never been clickable; the scenario that clicks it had simply never been
// executed (see the note on `--dry-run` in ARCHITECTURE.md).
export const GYM_LOCATION = {
  latitude: CRAG_LOCATION.latitude - 0.05,
  longitude: CRAG_LOCATION.longitude + 0.01,
};

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

// AR-54: a submitter id distinct from CLIMBER/ADMIN (declared further down
// this file), for detail fixtures where nothing tests the "add more photos"
// affordance -- keeps it hidden in every pre-existing scenario exactly as
// before that field existed.
const OTHER_SUBMITTER_ID = '99999999-0000-4000-8000-000000000001';

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
      photosPending: false,
      photoMediaIds: [],
      submittedBy: OTHER_SUBMITTER_ID,
    },
  ],
};

const SAMPLE_HOURS = {
  '0': [],
  '1': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '2': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '3': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '4': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '5': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '6': [{ opens: '00:00', closes: '00:00', fullDay: true }],
};

export const GYM_DETAIL: GymDetail = {
  id: GYM_ID,
  kind: 'GYM',
  name: 'Vertical Edge Climbing Gym',
  ...GYM_LOCATION,
  status: 'VERIFIED',
  disciplinesOffered: ['BOULDERING', 'LEAD'],
  operatingHours: SAMPLE_HOURS,
  ianaTimezone: 'America/New_York',
  photosPending: false,
  photoMediaIds: [],
  submittedBy: OTHER_SUBMITTER_ID,
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

// ---------------------------------------------------------------------------
// Sprint 1/2 frontend backfill fixtures
//
// Same contract as everything above: typed against the interfaces apps/web
// consumes, which mirror the API's DTOs, so a drift between the two surfaces
// as a TypeScript error in this file rather than as a mystery at runtime.
// ---------------------------------------------------------------------------

import type {
  CheckInResult,
  ClimbLogResult,
  GradeConsensus,
  MediaAsset,
  PublicUser,
  SubmitGymResult,
  SubmitRouteResult,
} from '@/lib/types';

export const CLIMBER: PublicUser = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'alex@example.com',
  displayName: 'Alex Sender',
  role: 'VERIFIED_USER',
};

export const ADMIN: PublicUser = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'admin@example.com',
  displayName: 'Sam Admin',
  role: 'SYSTEM_ADMIN',
};

export const MEDIA_ASSET: MediaAsset = {
  id: '66666666-6666-4666-8666-666666666666',
  purpose: 'ROUTE_VERIFICATION_PHOTO',
  mimeType: 'image/png',
  byteSize: 5_120,
  moderationStatus: 'PENDING',
  etag: 'fixture-etag',
};

export const SECOND_ROUTE_ID = '77777777-7777-4777-8777-777777777777';

// A crag with two routes, one of them already VERIFIED. Only used by scenarios
// that opt into it, so the single-route CRAG_DETAIL above -- which Epic 4's
// fourteen green scenarios assert against -- keeps its exact shape.
//
// The VERIFIED sibling is the point: AR-25 says an already-verified route
// offers no verify action, and proving that needs a crag where some route is
// verifiable and another is not, in one panel.
export const MULTI_ROUTE_CRAG_DETAIL: CragDetail = {
  ...CRAG_DETAIL,
  routes: [
    CRAG_DETAIL.routes[0],
    {
      ...CRAG_DETAIL.routes[0],
      id: SECOND_ROUTE_ID,
      name: 'Sun Salutation',
      status: 'VERIFIED',
      verificationCount: 4,
      gearRequirements: ['CRASH_PAD'],
      boltCount: null,
      minRopeLengthM: null,
      discipline: 'BOULDERING',
      grade: {
        source: 'CONSENSUS',
        gradeOrdinal: 4,
        totalVotes: 6,
        distribution: [{ gradeOrdinal: 4, voteCount: 6 }],
      },
    },
  ],
};

// --- BL-x13 (Sept 9, 2026): tiered pins + clustering -----------------------
//
// All three fixtures below are OPT-IN (world.ts's includeRoutePins /
// includeNeighbourCrag flags, off by default). The default map-pins payload is
// left byte-for-byte as Epic 4 left it, because ninety-one green scenarios
// depend on exactly two pins being on screen and on their ~184px separation --
// see the note on GYM_LOCATION.
//
// Geometry, worked at latitude 37.73 where 1 degree of longitude is ~88km and
// Leaflet's projection gives 256 * 2^zoom pixels per 360 degrees:
//
//   zoom 12 -> ~2,913 px per degree
//   zoom 16 -> ~46,603 px per degree
//
// The two route pins sit 0.00228 degrees either side of the crag, ~200m each
// way. That is ~212px apart at zoom 16 -- clear of CLUSTER_RADIUS_PX (70) so
// they render as two pins, and clear of the 150px icon width so Playwright can
// click either without the other obstructing it.
export const ROUTE_PIN_A_LOCATION = {
  latitude: CRAG_LOCATION.latitude,
  longitude: CRAG_LOCATION.longitude - 0.00228,
};

export const ROUTE_PIN_B_LOCATION = {
  latitude: CRAG_LOCATION.latitude,
  longitude: CRAG_LOCATION.longitude + 0.00228,
};

export const ROUTE_PIN_A: MapPin = {
  id: ROUTE_ID,
  kind: 'ROUTE',
  name: 'Solar Power',
  ...ROUTE_PIN_A_LOCATION,
  status: 'UNVERIFIED',
  cragId: CRAG_ID,
};

export const ROUTE_PIN_B: MapPin = {
  id: SECOND_ROUTE_ID,
  kind: 'ROUTE',
  name: 'Sun Salutation',
  ...ROUTE_PIN_B_LOCATION,
  status: 'VERIFIED',
  cragId: CRAG_ID,
};

// ~890m north of the crag: ~23px at zoom 12, comfortably inside
// CLUSTER_RADIUS_PX, so the two crags collapse into one cluster at the map's
// default zoom and separate again on the way in. Deliberately NOT near enough
// to the gym to drag it into the same cluster -- the breakdown label's whole
// job is to count the two kinds separately, which needs them apart.
export const NEIGHBOUR_CRAG_ID = '55555555-5555-4555-8555-555555555555';

export const NEIGHBOUR_CRAG_PIN: MapPin = {
  id: NEIGHBOUR_CRAG_ID,
  kind: 'CRAG',
  name: 'Shadow Buttress',
  latitude: CRAG_LOCATION.latitude + 0.008,
  longitude: CRAG_LOCATION.longitude,
  status: 'VERIFIED',
  routeCount: 5,
};

// An unverified gym, so the admin queue has something in it and the gym
// verify sheet has something to act on. VERIFIED_GYM_PIN above is deliberately
// verified, and BL-020's "a verified pin looks different" scenario depends on
// that, so this is a second gym rather than a mutation of the first.
//
// ~5.5km north of the crag, for the pixel-separation reason spelled out on
// GYM_LOCATION above: a 140px-wide marker needs ~4.2km of clearance at zoom 12
// before it stops covering its neighbour.
export const UNVERIFIED_GYM_ID = '88888888-8888-4888-8888-888888888888';

const UNVERIFIED_GYM_LOCATION = {
  latitude: CRAG_LOCATION.latitude + 0.05,
  longitude: CRAG_LOCATION.longitude,
};

export const UNVERIFIED_GYM_PIN: MapPin = {
  id: UNVERIFIED_GYM_ID,
  kind: 'GYM',
  name: 'Chalk Line Bouldering',
  ...UNVERIFIED_GYM_LOCATION,
  status: 'UNVERIFIED',
};

// 250m south of that gym: inside its 300m radius, and ~1.4km from the crag, so
// a scenario standing here is in range of the gym and of nothing else.
export const GYM_IN_RANGE_LOCATION = {
  latitude: UNVERIFIED_GYM_LOCATION.latitude - 250 / 111_320,
  longitude: UNVERIFIED_GYM_LOCATION.longitude,
};

// 350m south of that gym: outside its 300m radius. Deliberately gym-relative
// rather than reusing the crag's OUT_OF_RANGE_LOCATION (~5.5km from this
// gym) -- MapCanvas.tsx's FirstFixController flies the map to the viewer's
// own geolocation at zoom 14 on first load, and at that zoom ~5.5km away is
// outside the rendered viewport entirely. A pin outside the viewport still
// exists in the DOM (Leaflet does not virtualize markers), but Playwright
// cannot scroll a page to reach a marker positioned via an internal Leaflet
// transform, so a click on it hangs until the step's own timeout -- the same
// failure mode ARCHITECTURE.md already documents for GYM_LOCATION once being
// too close (a pixel-overlap problem); this is the opposite fixture bug, too
// far for the same zoom-14 fly-to to still show it.
export const GYM_OUT_OF_RANGE_LOCATION = {
  latitude: UNVERIFIED_GYM_LOCATION.latitude - 350 / 111_320,
  longitude: UNVERIFIED_GYM_LOCATION.longitude,
};

export const UNVERIFIED_GYM_DETAIL: GymDetail = {
  id: UNVERIFIED_GYM_ID,
  kind: 'GYM',
  name: 'Chalk Line Bouldering',
  ...UNVERIFIED_GYM_LOCATION,
  status: 'UNVERIFIED',
  disciplinesOffered: ['BOULDERING'],
  operatingHours: SAMPLE_HOURS,
  ianaTimezone: 'America/Denver',
  photosPending: true,
  photoMediaIds: [],
  submittedBy: OTHER_SUBMITTER_ID,
};

export const SUBMIT_ROUTE_RESULT: SubmitRouteResult = {
  route: {
    id: '99999999-9999-4999-8999-999999999999',
    name: 'First Light',
    cragId: CRAG_ID,
    status: 'UNVERIFIED',
  },
  crag: { id: CRAG_ID, name: 'First Light', status: 'UNVERIFIED' },
  cragCreated: true,
};

export const SUBMIT_GYM_RESULT: SubmitGymResult = {
  id: UNVERIFIED_GYM_ID,
  name: 'Chalk Line Bouldering',
  status: 'UNVERIFIED',
};

// The consensus a vote comes back with: four votes, so BL-016 flips the
// source from PROPOSED to CONSENSUS and the sheet says so.
export const VOTE_CONSENSUS: GradeConsensus = {
  source: 'CONSENSUS',
  gradeOrdinal: 15,
  totalVotes: 4,
  distribution: [
    { gradeOrdinal: 15, voteCount: 3 },
    { gradeOrdinal: 14, voteCount: 1 },
  ],
};

export const CLIMB_LOG_RESULT: ClimbLogResult = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  outcome: 'COMPLETED',
  gradeSnapshotOrdinal: 14,
  loggedAt: '2026-09-01T12:00:00.000Z',
};

// BL-024, Epic 5. GymCheckinsController's POST response -- only the fields
// CheckInResult declares (id, checkedInAt) matter to the fixture; gymId/
// userId would also be on the real response but nothing here reads them.
export const CHECK_IN_RESULT: CheckInResult = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  checkedInAt: '2026-09-01T12:05:00.000Z',
};

// ---------------------------------------------------------------------------
// Epic 6 -- Media & Moderation (BL-026-030)
// ---------------------------------------------------------------------------

import type { AppNotification, FlagQueueItem } from '@/lib/types';

// The three notification kinds Foundation §12 defines. Newest first,
// mirroring NotificationsController's ORDER BY created_at DESC.
// FRIEND_ADDED (AR-55) fires when someone redeems this user's invite link.
export const NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n0000000-0000-4000-8000-000000000000',
    type: 'FRIEND_ADDED',
    relatedEntityId: 'fr000000-0000-4000-8000-000000000000',
    createdAt: '2026-09-03T12:00:00.000Z',
  },
  {
    id: 'n1111111-1111-4111-8111-111111111111',
    type: 'STRIKE_ISSUED',
    relatedEntityId: 'acc11111-1111-4111-8111-111111111111',
    createdAt: '2026-09-02T09:00:00.000Z',
  },
  {
    id: 'n2222222-2222-4222-8222-222222222222',
    type: 'IMAGE_REJECTED',
    relatedEntityId: 'mod22222-2222-4222-8222-222222222222',
    createdAt: '2026-09-01T18:00:00.000Z',
  },
];

// --- invite-link friendship (AR-55, BL-040/041) --------------------------

import type {
  CreatedInviteLink,
  FriendSummary,
  RedeemInviteResult,
  ReviewView,
} from '@/lib/types';

export const FRIEND_INVITE_LINK: CreatedInviteLink = {
  token: 'demo-invite-token-abc123',
  url: 'http://localhost:3000/friends/invite/demo-invite-token-abc123',
  expiresAt: '2026-09-14T12:00:00.000Z',
};

export const REDEEM_FRIENDED: RedeemInviteResult = {
  outcome: 'FRIENDED',
  friendshipId: 'fr111111-1111-4111-8111-111111111111',
  friendUserId: 'us222222-2222-4222-8222-222222222222',
};

export const FRIENDS: FriendSummary[] = [
  {
    friendshipId: 'fr111111-1111-4111-8111-111111111111',
    userId: 'us222222-2222-4222-8222-222222222222',
    email: 'jordan@example.com',
    displayName: 'Jordan',
    since: '2026-09-03T12:00:00.000Z',
  },
];

// --- profile data (BL-036/037, BL-x09/x10) -----------------------------
// Minimal shapes so ProfileScreen's Promise.all resolves -- there was no
// profile web test before Epic 9, so these are new.

import type { GymActivity, OutdoorAnalytics } from '@/lib/types';

export const GYM_ACTIVITY: GymActivity = {
  badges: [],
  streaks: [],
  badgesPublic: true,
  isOwnProfile: true,
};

const EMPTY_DISCIPLINE = {
  completed: 0,
  attempted: 0,
  completionRate: 0,
  gradeDistribution: [],
};

export const OUTDOOR_ANALYTICS: OutdoorAnalytics = {
  SPORT_CLIMBING: EMPTY_DISCIPLINE,
  BOULDERING: EMPTY_DISCIPLINE,
  TRADITIONAL_CLIMBING: EMPTY_DISCIPLINE,
};

// --- reviews (BL-045) ---------------------------------------------------

export const REVIEWS: ReviewView[] = [
  {
    id: 'rv111111-1111-4111-8111-111111111111',
    authorId: 'us333333-3333-4333-8333-333333333333',
    authorDisplayName: 'Alex',
    body: 'Steep and pumpy — bring extra draws.',
    photoMediaId: null,
    photoPending: false,
    createdAt: '2026-09-04T15:00:00.000Z',
  },
];

const REVIEW_PHOTO_ID = 'f1111111-1111-4111-8111-111111111111';
const VERIFICATION_PHOTO_ID = 'f2222222-2222-4222-8222-222222222222';

// One ordinary photo (a community report sent it back) and one route
// verification photo (rejection always strikes -- AR-1).
export const FLAG_QUEUE: FlagQueueItem[] = [
  {
    mediaAssetId: REVIEW_PHOTO_ID,
    ownerUserId: CLIMBER.id,
    purpose: 'REVIEW_PHOTO',
    mimeType: 'image/jpeg',
    byteSize: 40_000,
    moderationStatus: 'PENDING',
    createdAt: '2026-09-02T08:00:00.000Z',
    reports: [
      {
        id: 'r1111111-1111-4111-8111-111111111111',
        reportedBy: '99999999-9999-4999-8999-999999999999',
        reason: 'Not climbing related',
        createdAt: '2026-09-02T08:30:00.000Z',
      },
    ],
  },
  {
    mediaAssetId: VERIFICATION_PHOTO_ID,
    ownerUserId: CLIMBER.id,
    purpose: 'ROUTE_VERIFICATION_PHOTO',
    mimeType: 'image/png',
    byteSize: 120_000,
    moderationStatus: 'PENDING',
    createdAt: '2026-09-02T07:00:00.000Z',
    reports: [],
  },
];

export const MODERATION_RESULT = {
  decision: 'REJECT' as const,
  assetStatus: 'REJECTED' as const,
  verificationVoided: false,
  routeReverted: false,
  cragReverted: false,
  gymReverted: false,
  strikeIssued: false,
  newStrikeCount: null,
  userBanned: false,
};

// A 1x1 transparent PNG -- the flag queue renders each pending asset as an
// <img src="/api/media/:id">, so that GET has to return image bytes, not JSON.
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
