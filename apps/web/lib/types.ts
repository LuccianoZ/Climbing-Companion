// Mirrors the payloads apps/api returns. Kept as a hand-written mirror in
// apps/web rather than shared through packages/shared-types: that workspace
// is still an empty stub (only a package.json, AR-7's placeholder) with no
// build, no entry point and no consumer, and wiring a CommonJS package into
// the Next app's bundler is a larger change than this backfill scopes.
// Flagged in AR-19 as the natural first tenant of that package once someone
// stands it up.
//
// Epic 4 (BL-019-022) needed only the read surface below. The Sprint 1/2
// frontend backfill adds the write surface -- auth, submission, media,
// verification, voting and logging -- mirroring the DTOs in
// apps/api/src/**/dto/*.ts field for field. The API's ValidationPipe runs
// `forbidNonWhitelisted: true`, so an unknown key in a request body is a
// 400: nothing may be added to a payload that its DTO does not declare.

// --- shared enums (Architecture section 1) ---------------------------------

export type LifecycleStatus = 'UNVERIFIED' | 'VERIFIED' | 'ARCHIVED';

export type OutdoorDiscipline =
  | 'SPORT_CLIMBING'
  | 'BOULDERING'
  | 'TRADITIONAL_CLIMBING';

export type GearRequirement =
  | 'QUICKDRAWS'
  | 'CRASH_PAD'
  | 'TRAD_GEAR'
  | 'HELMET';

export type GymDiscipline =
  | 'AUTO_BELAY'
  | 'TOP_ROPE'
  | 'LEAD'
  | 'BOULDERING'
  | 'SPEED_CLIMBING';

export type UserRole = 'VERIFIED_USER' | 'SYSTEM_ADMIN';

export type ClimbOutcome = 'COMPLETED' | 'ATTEMPTED';

export type MediaPurpose =
  | 'PROFILE_PHOTO'
  | 'ROUTE_VERIFICATION_PHOTO'
  | 'GYM_VERIFICATION_PHOTO'
  | 'REVIEW_PHOTO';

export type MediaModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type MapPinKind = 'CRAG' | 'GYM';

// --- map read surface (AR-19) ----------------------------------------------

export interface MapPin {
  id: string;
  kind: MapPinKind;
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
}

export interface GradeDistributionEntry {
  gradeOrdinal: number;
  voteCount: number;
}

export interface GradeConsensus {
  source: 'PROPOSED' | 'CONSENSUS';
  gradeOrdinal: number;
  totalVotes: number;
  distribution: GradeDistributionEntry[];
}

export interface MapRouteSummary {
  id: string;
  name: string;
  discipline: OutdoorDiscipline;
  gearRequirements: GearRequirement[];
  summary: string;
  boltCount: number | null;
  minRopeLengthM: number | null;
  status: LifecycleStatus;
  latitude: number;
  longitude: number;
  grade: GradeConsensus;
  verificationCount: number;
  verificationsRequired: number;
}

export interface CragDetail {
  id: string;
  kind: 'CRAG';
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
  routes: MapRouteSummary[];
}

export interface GymDetail {
  id: string;
  kind: 'GYM';
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
  disciplinesOffered: GymDiscipline[];
}

export type PinDetail = CragDetail | GymDetail;

export interface MapSearchResult {
  id: string;
  kind: 'ROUTE' | 'CRAG' | 'GYM';
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
  cragId: string | null;
}

// --- auth (BL-001-004) -----------------------------------------------------

// AuthService.PublicUser -- the shape returned by register, login and
// GET /api/auth/me alike. Never carries the password hash or the session
// token; the session itself is an HttpOnly cookie the browser holds and this
// app never reads (AR-22).
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

// --- media (BL-008) --------------------------------------------------------

// MediaController's POST response. The binary is deliberately absent: it is
// never returned inline (Foundation section 19.1 bans base64-in-JSON) and is
// fetched from GET /api/media/:id instead.
export interface MediaAsset {
  id: string;
  purpose: MediaPurpose;
  mimeType: string;
  byteSize: number;
  moderationStatus: MediaModerationStatus;
  etag: string;
}

// The gateway's own constants (media-asset.entity.ts), restated so the client
// can fail fast rather than spend an upload round trip on a file the server
// will reject anyway.
export const MAX_MEDIA_BYTES = 2_097_152;
export const ALLOWED_MEDIA_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
];

// --- submission (BL-006 / BL-007) ------------------------------------------

// SubmitRouteDto, field for field. boltCount and minRopeLengthM are optional
// for Sport/Trad and *forbidden* for Bouldering -- the DTO's cross-field
// validator rejects a non-null value there, and Architecture section 3 backs
// it with a Postgres CHECK. The form omits the keys entirely rather than
// sending nulls (AR-14).
export interface SubmitRouteInput {
  name: string;
  latitude: number;
  longitude: number;
  discipline: OutdoorDiscipline;
  gearRequirements?: GearRequirement[];
  summary: string;
  proposedGradeOrdinal: number;
  boltCount?: number;
  minRopeLengthM?: number;
}

export interface SubmitGymInput {
  name: string;
  latitude: number;
  longitude: number;
}

// RoutesService.SubmitRouteResult. `cragCreated` is what tells the submitter
// whether they founded a new crag or attached to an existing one -- the only
// part of BL-006's transaction the UI surfaces.
export interface SubmitRouteResult {
  route: { id: string; name: string; cragId: string; status: LifecycleStatus };
  crag: { id: string; name: string; status: LifecycleStatus };
  cragCreated: boolean;
}

export interface SubmitGymResult {
  id: string;
  name: string;
  status: LifecycleStatus;
}

// --- verification, voting, logging (BL-009-018) ----------------------------

// Every one of these carries the viewer's own resolved coordinates. AR-16:
// the server takes latitude/longitude from the DTO on the real path and from
// X-Test-Mock-GPS in Cucumber, and re-checks the 300m radius with PostGIS
// regardless of what the client believed.
export interface ViewerLocationInput {
  latitude: number;
  longitude: number;
}

export interface SubmitRouteVerificationInput extends ViewerLocationInput {
  mediaAssetId: string;
  gradeOrdinal: number;
}

export interface SubmitGymVerificationInput extends ViewerLocationInput {
  mediaAssetId: string;
  disciplinesSubmitted: GymDiscipline[];
}

export interface VoteOnGradeInput extends ViewerLocationInput {
  gradeOrdinal: number;
}

export interface LogClimbInput extends ViewerLocationInput {
  outcome: ClimbOutcome;
}

// BL-024. A check-in carries no data of its own beyond "I am here" --
// gym_checkins has no column this input would populate besides the FKs and
// timestamp, both resolved server-side (Architecture.md §5) -- so this is a
// bare alias rather than an interface with its own fields. AR-39: BL-025 (a
// sibling self-recorded grade tier) was cut from Sprint 3 scope before
// implementation began, so there is no CheckInInput field for it and none
// is planned.
export type CheckInInput = ViewerLocationInput;

export interface SubmitRouteVerificationResult {
  route: { id: string; status: LifecycleStatus };
  routeNewlyVerified: boolean;
  cragNewlyVerified: boolean;
}

export interface SubmitGymVerificationResult {
  gym: {
    id: string;
    status: LifecycleStatus;
    disciplinesOffered: GymDiscipline[];
  };
  gymNewlyVerified: boolean;
}

export interface ClimbLogResult {
  id: string;
  outcome: ClimbOutcome;
  gradeSnapshotOrdinal: number;
  loggedAt: string;
}

// GymCheckinsController's POST response -- the saved GymCheckin entity.
// Only the fields the UI actually reads are declared (AR-19's convention
// for these hand-mirrored types); gymId/userId come back too but nothing
// here needs them.
export interface CheckInResult {
  id: string;
  checkedInAt: string;
}

export interface AdminVerifyGymInput {
  disciplinesOffered: GymDiscipline[];
}

// --- display labels --------------------------------------------------------

export const DISCIPLINE_LABELS: Record<OutdoorDiscipline, string> = {
  SPORT_CLIMBING: 'Sport Climbing',
  BOULDERING: 'Bouldering',
  TRADITIONAL_CLIMBING: 'Traditional',
};

export const GYM_DISCIPLINE_LABELS: Record<GymDiscipline, string> = {
  AUTO_BELAY: 'Auto Belay',
  TOP_ROPE: 'Top Rope',
  LEAD: 'Lead',
  BOULDERING: 'Bouldering',
  SPEED_CLIMBING: 'Speed Climbing',
};

// BL-023, AR-33: gear renders as named chips and named checkboxes, never as
// icons. The icon set was dropped from scope rather than held for artwork,
// so these labels are the whole of that story's vocabulary.
export const GEAR_REQUIREMENT_LABELS: Record<GearRequirement, string> = {
  QUICKDRAWS: 'Quickdraws',
  CRASH_PAD: 'Crash Pad',
  TRAD_GEAR: 'Trad Gear',
  HELMET: 'Helmet',
};

export const GEAR_REQUIREMENTS: readonly GearRequirement[] = [
  'QUICKDRAWS',
  'CRASH_PAD',
  'TRAD_GEAR',
  'HELMET',
];

export const OUTDOOR_DISCIPLINES: readonly OutdoorDiscipline[] = [
  'SPORT_CLIMBING',
  'BOULDERING',
  'TRADITIONAL_CLIMBING',
];

export const GYM_DISCIPLINES: readonly GymDiscipline[] = [
  'AUTO_BELAY',
  'TOP_ROPE',
  'LEAD',
  'BOULDERING',
  'SPEED_CLIMBING',
];

// Architecture section 3's CHECK constraint, as a predicate the form can ask
// before it decides whether to render the bolt/rope fieldset at all.
export function acceptsRopeDetails(discipline: OutdoorDiscipline): boolean {
  return discipline !== 'BOULDERING';
}
