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
  | 'REVIEW_PHOTO'
  // Sept 3 revision (AR-51, BL-x04/x05): >= 3 photos on every gym /
  // outdoor-climb submission.
  | 'ROUTE_SUBMISSION_PHOTO'
  | 'GYM_SUBMISSION_PHOTO';

// --- gym operating hours (AR-51, BL-x04) ----------------------------------

// Mirrors OperatingHoursRange / OperatingHours in apps/api gym.entity.ts.
// `closes` < `opens` means the range runs past midnight; `fullDay` (with
// 00:00/00:00) means open 24h; multiple ranges in a day = a split shift; an
// empty array = closed that day. A valid submission carries all seven keys.
export interface OperatingHoursRange {
  opens: string; // "HH:MM"
  closes: string; // "HH:MM"
  fullDay: boolean;
}

// Keys "0".."6", 0 = Sunday.
export type OperatingHours = Record<string, OperatingHoursRange[]>;

export const WEEKDAY_LABELS: readonly string[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const WEEKDAY_SHORT: readonly string[] = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

export const MIN_SUBMISSION_PHOTOS = 3;

// Foundation §13 / §12: the one static support address. User-requested gym
// hours changes are handled by email (§13, AR-51 BL-x08), not an in-app form.
export const SUPPORT_EMAIL = 'support@climbingcompanion.com';

export type MediaModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// --- moderation & notifications (Epic 6, BL-026-030) ----------------------

export type NotificationType =
  | 'FRIEND_REQUEST_RECEIVED'
  | 'IMAGE_REJECTED'
  | 'STRIKE_ISSUED';

export type ModerationDecision = 'APPROVE' | 'REJECT';

export type ModerationReasonPreset =
  | 'OFF_TOPIC'
  | 'LOW_IMAGE_QUALITY'
  | 'INAPPROPRIATE_EXPLICIT'
  | 'SUSPECTED_FRAUDULENT'
  | 'OTHER';

// The two AccountabilityAction values an admin can pair with a Reject on a
// photo (Foundation §10.2); the other two are Admin-Dashboard actions.
export type PairableAccountabilityAction = 'ISSUE_STRIKE' | 'BAN_OUTRIGHT';

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
  // BL-x05: true while no ROUTE_SUBMISSION_PHOTO for this route is APPROVED.
  photosPending: boolean;
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
  // Sept 3 revision (AR-51, BL-x04). Rendered in the gym's local time via
  // ianaTimezone.
  operatingHours: OperatingHours;
  ianaTimezone: string;
  // BL-x05: true while no GYM_SUBMISSION_PHOTO for this gym is APPROVED.
  photosPending: boolean;
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
export const MAX_MEDIA_BYTES = 5_242_880; // 5MB (raised from 2MB, Sept 2 2026)
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
  // AR-51 BL-x05: >= 3, pre-uploaded via POST /api/media with
  // purpose = ROUTE_SUBMISSION_PHOTO.
  photoMediaIds: string[];
  // BL-x02: submitter's live device location for the non-admin 300m gate.
  // Omitted for an admin submission (gate skipped server-side by role).
  deviceLatitude?: number;
  deviceLongitude?: number;
}

export interface SubmitGymInput {
  name: string;
  latitude: number;
  longitude: number;
  // AR-51 BL-x04: authoritative at submission (>= 1).
  disciplinesOffered: GymDiscipline[];
  operatingHours: OperatingHours;
  // AR-51 BL-x05: >= 3, purpose = GYM_SUBMISSION_PHOTO.
  photoMediaIds: string[];
  deviceLatitude?: number;
  deviceLongitude?: number;
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

// AR-51 BL-x06: gym verification is confirm/dispute. `informationAccurate:
// true` -> counts toward the 4 (photo now OPTIONAL, no discipline re-entry).
// `false` -> `disputeDetail` (<=500) becomes required and is routed to the
// admin dispute queue; it does not count.
export interface SubmitGymVerificationInput extends ViewerLocationInput {
  informationAccurate: boolean;
  mediaAssetId?: string;
  disputeDetail?: string;
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
  outcome: 'CONFIRMED' | 'DISPUTED';
  verification: { id: string } | null;
  dispute: { id: string } | null;
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

// --- admin stewardship (AR-51, BL-x07 / BL-x08 / BL-033) ------------------

// AdminUpdateGymDto / AdminUpdateRouteDto -- every field optional; only the
// keys present are changed. lat/lng must move together.
export interface AdminUpdateGymInput {
  name?: string;
  latitude?: number;
  longitude?: number;
  disciplinesOffered?: GymDiscipline[];
  operatingHours?: OperatingHours;
  // Full desired photo set (>= 3). Added ids linked + APPROVED, dropped ids
  // unlinked.
  photoMediaIds?: string[];
}

export interface AdminUpdateRouteInput {
  name?: string;
  latitude?: number;
  longitude?: number;
  discipline?: OutdoorDiscipline;
  gearRequirements?: GearRequirement[];
  summary?: string;
  proposedGradeOrdinal?: number;
  boltCount?: number | null;
  minRopeLengthM?: number | null;
  photoMediaIds?: string[];
}

// GET /api/gyms/:id and /api/routes/:id (admin) -- the editor's read.
export interface SubmissionPhotoView {
  id: string;
  mimeType: string;
  byteSize: number;
  moderationStatus: MediaModerationStatus;
  createdAt: string;
}

export interface AdminGymView {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  disciplinesOffered: GymDiscipline[];
  operatingHours: OperatingHours;
  ianaTimezone: string;
  status: LifecycleStatus;
  verifiedDirectlyByAdmin: boolean;
  photos: SubmissionPhotoView[];
}

export interface AdminRouteView {
  id: string;
  name: string;
  cragId: string;
  cragName: string | null;
  isFoundingRoute: boolean;
  latitude: number;
  longitude: number;
  discipline: OutdoorDiscipline;
  gearRequirements: GearRequirement[];
  summary: string;
  proposedGradeOrdinal: number;
  boltCount: number | null;
  minRopeLengthM: number | null;
  status: LifecycleStatus;
  photos: SubmissionPhotoView[];
}

export interface HardDeleteGymResult {
  gymId: string;
  deleted: boolean;
}

export interface HardDeleteRouteResult {
  routeId: string;
  deleted: boolean;
  cragDeleted: boolean;
  siblingRoutesDeleted: number;
}

export interface RestoreResult {
  restored: boolean;
  alreadyActive: boolean;
  cragRestored?: boolean;
}

export interface ForceArchiveRouteResult {
  routeId: string;
  routeArchived: boolean;
  cragArchived: boolean;
  alreadyArchived: boolean;
}

export interface ForceArchiveGymResult {
  gymId: string;
  gymArchived: boolean;
  alreadyArchived: boolean;
}

export interface GymDisputeQueueItem {
  id: string;
  gymId: string;
  gymName: string;
  reporterUserId: string;
  detail: string;
  createdAt: string;
}

export type AccountabilityAction =
  | 'ISSUE_STRIKE'
  | 'REVOKE_STRIKE'
  | 'BAN_OUTRIGHT'
  | 'RESTORE_ACCOUNT';

export const ACCOUNTABILITY_ACTION_LABELS: Record<AccountabilityAction, string> =
  {
    ISSUE_STRIKE: 'Issue Strike',
    REVOKE_STRIKE: 'Revoke Strike',
    BAN_OUTRIGHT: 'Ban Outright',
    RESTORE_ACCOUNT: 'Restore Account',
  };

export interface ApplyAccountabilityActionInput {
  action: AccountabilityAction;
  reasonPreset?: ModerationReasonPreset;
  reasonText?: string;
}

export interface AccountabilityResult {
  action: AccountabilityAction;
  targetUserId: string;
  strikeCount: number;
  isBanned: boolean;
  autoBanned: boolean;
}

export interface UserAuditEntry {
  id: string;
  actionType: AccountabilityAction;
  adminUserId: string;
  reasonPreset: ModerationReasonPreset | null;
  reasonText: string;
  triggeringMediaActionId: string | null;
  createdAt: string;
}

export interface UserAuditView {
  userId: string;
  strikeCount: number;
  isBanned: boolean;
  bannedAt: string | null;
  history: UserAuditEntry[];
}

// --- moderation payloads (Epic 6) ----------------------------------------

// NotificationsController's GET response. `relatedEntityId` points at the
// media_moderation_actions row (IMAGE_REJECTED) or user_accountability_actions
// row (STRIKE_ISSUED) -- the client does not dereference it, it is here only
// so the shape mirrors the API. The reasoning itself is in the user's email
// (Foundation §12), so the card links there rather than showing it inline.
export interface AppNotification {
  id: string;
  type: NotificationType;
  relatedEntityId: string | null;
  createdAt: string;
}

export interface FlagQueueReport {
  id: string;
  reportedBy: string;
  reason: string | null;
  createdAt: string;
}

export interface FlagQueueItem {
  mediaAssetId: string;
  ownerUserId: string;
  purpose: MediaPurpose;
  mimeType: string;
  byteSize: number;
  moderationStatus: MediaModerationStatus;
  createdAt: string;
  reports: FlagQueueReport[];
}

// ModerationController's POST /admin/media/:id/moderate body. `reasonPreset`
// and `reasonText` are both optional at the wire level; ModerationService
// enforces "at least one, and OTHER needs text" for the branches that
// require a reason (verification photo, or paired with a strike/ban).
export interface ModerateMediaInput {
  decision: ModerationDecision;
  reasonPreset?: ModerationReasonPreset;
  reasonText?: string;
  pairedAction?: PairableAccountabilityAction;
}

export interface ModerationResult {
  decision: ModerationDecision;
  assetStatus: MediaModerationStatus;
  verificationVoided: boolean;
  routeReverted: boolean;
  cragReverted: boolean;
  gymReverted: boolean;
  strikeIssued: boolean;
  newStrikeCount: number | null;
  userBanned: boolean;
}

export const MODERATION_REASON_PRESET_LABELS: Record<
  ModerationReasonPreset,
  string
> = {
  OFF_TOPIC: 'Off-topic content',
  LOW_IMAGE_QUALITY: 'Low image quality',
  INAPPROPRIATE_EXPLICIT: 'Inappropriate/explicit content',
  SUSPECTED_FRAUDULENT: 'Suspected fraudulent submission',
  OTHER: 'Other (free text required)',
};

export const MODERATION_REASON_MAX_LENGTH = 500;

export const MEDIA_PURPOSE_LABELS: Record<MediaPurpose, string> = {
  PROFILE_PHOTO: 'Profile photo',
  ROUTE_VERIFICATION_PHOTO: 'Route verification photo',
  GYM_VERIFICATION_PHOTO: 'Gym verification photo',
  REVIEW_PHOTO: 'Review photo',
  ROUTE_SUBMISSION_PHOTO: 'Route submission photo',
  GYM_SUBMISSION_PHOTO: 'Gym submission photo',
};

// AR-1: a verification photo's rejection always strikes the uploader, no
// admin discretion. The admin sheet uses this to lock the strike in and hide
// the plain "Reject" button for those two purposes.
export function isVerificationPhoto(purpose: MediaPurpose): boolean {
  return (
    purpose === 'ROUTE_VERIFICATION_PHOTO' ||
    purpose === 'GYM_VERIFICATION_PHOTO'
  );
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
