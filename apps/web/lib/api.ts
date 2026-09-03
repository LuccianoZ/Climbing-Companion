import type {
  AccountabilityResult,
  AdminGymView,
  AdminRouteView,
  AdminUpdateGymInput,
  AdminUpdateRouteInput,
  AdminVerifyGymInput,
  AppNotification,
  ApplyAccountabilityActionInput,
  CheckInInput,
  CheckInResult,
  ClimbLogResult,
  CragDetail,
  FlagQueueItem,
  ForceArchiveGymResult,
  ForceArchiveRouteResult,
  GradeConsensus,
  GymDetail,
  GymDisputeQueueItem,
  HardDeleteGymResult,
  HardDeleteRouteResult,
  LoginInput,
  LogClimbInput,
  MapPin,
  MapSearchResult,
  MediaAsset,
  MediaPurpose,
  ModerateMediaInput,
  ModerationResult,
  PinDetail,
  PublicUser,
  RegisterInput,
  RestoreResult,
  SubmitGymInput,
  SubmitGymResult,
  SubmitGymVerificationInput,
  SubmitGymVerificationResult,
  SubmitRouteInput,
  SubmitRouteResult,
  SubmitRouteVerificationInput,
  SubmitRouteVerificationResult,
  UserAuditView,
  VoteOnGradeInput,
} from './types';

// next.config.ts rewrites /api/* to the NestJS app on :4000, so every request
// here is same-origin from the browser's point of view -- no CORS preflight,
// no NEXT_PUBLIC_API_URL to keep in sync across environments.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // The server's own message, kept separately from `message` (which stays
    // a developer-facing description of the failed request). AR-26 needs it:
    // both verification endpoints answer 403 for two genuinely different
    // refusals -- "that is your own submission" and "you are too far away" --
    // and the status code alone cannot tell them apart.
    readonly serverMessage: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Nest's exception filter serialises as { statusCode, message, error }, where
// `message` is a string for a thrown HttpException and a string[] when the
// ValidationPipe rejected the body. Both are flattened to one string; a body
// that is not JSON at all (a proxy error page, say) yields null rather than
// throwing a second error on top of the first.
async function readServerMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.filter((part) => typeof part === 'string').join('; ');
    }
    return null;
  } catch {
    return null;
  }
}

async function failed(path: string, response: Response): Promise<ApiError> {
  return new ApiError(
    `${path} responded ${response.status}`,
    response.status,
    await readServerMessage(response),
  );
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
    // The map read surface is public (AR-19), but the same helper serves the
    // authenticated screens and the session cookie is HttpOnly -- include it
    // everywhere rather than discovering the omission on one call later.
    credentials: 'include',
  });

  if (!response.ok) {
    throw await failed(path, response);
  }
  return (await response.json()) as T;
}

async function sendJson<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    // A DELETE carries no body; JSON.stringify(undefined) is the string
    // "undefined", so guard it.
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw await failed(path, response);
  }

  // POST /api/auth/logout and friends answer 200 with a body; a 204 would not.
  // Guard anyway so a future no-content endpoint does not throw on parse.
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Map read surface -- BL-019 through BL-022
// ---------------------------------------------------------------------------

export function fetchMapPins(signal?: AbortSignal): Promise<MapPin[]> {
  return getJson<MapPin[]>('/api/map/pins', signal);
}

// BL-021. The panel's shape depends on what was clicked, so the pin's kind
// picks the endpoint; both responses carry a `kind` discriminator of their
// own so the component narrows on the payload rather than remembering which
// request it made.
export function fetchPinDetail(
  kind: 'CRAG' | 'GYM',
  id: string,
  signal?: AbortSignal,
): Promise<PinDetail> {
  return kind === 'CRAG'
    ? getJson<CragDetail>(`/api/map/crags/${id}`, signal)
    : getJson<GymDetail>(`/api/map/gyms/${id}`, signal);
}

// BL-022. Our own database only -- Foundation section 9/18 rules out an
// external geocoder for the MVP, and there is deliberately no fallback
// provider here to reach for when this returns nothing.
export function searchMap(
  term: string,
  signal?: AbortSignal,
): Promise<MapSearchResult[]> {
  return getJson<MapSearchResult[]>(
    `/api/map/search?q=${encodeURIComponent(term)}`,
    signal,
  );
}

// ---------------------------------------------------------------------------
// Auth -- BL-001 through BL-004
// ---------------------------------------------------------------------------

// BL-002. The server sets the session cookie itself (HttpOnly, Secure,
// SameSite=Strict); there is no token for this app to store, and nothing here
// reads the cookie back. AR-22.
export function login(input: LoginInput): Promise<PublicUser> {
  return sendJson<PublicUser>('POST', '/api/auth/login', input);
}

// BL-001. Register returns the user but sets no cookie -- see AR-23 for why
// SessionProvider.signUp chains straight into login rather than making a new
// climber type their password a second time.
export function register(input: RegisterInput): Promise<PublicUser> {
  return sendJson<PublicUser>('POST', '/api/auth/register', input);
}

// BL-003. Must hit the server: a client-only "log out" leaves
// users.refresh_token_hash intact, so a replayed cookie would still pass
// SessionGuard.
export function logout(): Promise<{ success: boolean }> {
  return sendJson<{ success: boolean }>('POST', '/api/auth/logout', {});
}

// The session check the whole frontend is built on. A 401 here is the normal
// signed-out answer, not an error worth surfacing.
export function fetchMe(signal?: AbortSignal): Promise<PublicUser> {
  return getJson<PublicUser>('/api/auth/me', signal);
}

// BL-004. Always answers 200 whether or not the address has an account --
// AuthService no-ops silently for an unknown email (AR-12), so the UI must
// show the same confirmation either way and must not imply an account exists.
export function requestPasswordReset(
  email: string,
): Promise<{ success: boolean }> {
  return sendJson<{ success: boolean }>(
    'POST',
    '/api/auth/password-reset/request',
    { email },
  );
}

export function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<{ success: boolean }> {
  return sendJson<{ success: boolean }>(
    'POST',
    '/api/auth/password-reset/confirm',
    { token, newPassword },
  );
}

// ---------------------------------------------------------------------------
// Media gateway -- BL-008
// ---------------------------------------------------------------------------

// Real multipart, never base64-in-JSON: that encoding was explicitly rejected
// in backend review (Foundation section 19.1) and inflates the payload by a
// third against a hard 5MB cap. Content-Type is deliberately NOT set -- the
// browser has to add its own multipart boundary, and setting the header by
// hand strips it and makes multer fail to parse the body.
export async function uploadMedia(
  file: File,
  purpose: MediaPurpose,
): Promise<MediaAsset> {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', purpose);

  const response = await fetch('/api/media', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    body: form,
  });

  if (!response.ok) {
    throw await failed('/api/media', response);
  }
  return (await response.json()) as MediaAsset;
}

// ---------------------------------------------------------------------------
// Submission -- BL-006 / BL-007
// ---------------------------------------------------------------------------

export function submitRoute(
  input: SubmitRouteInput,
): Promise<SubmitRouteResult> {
  return sendJson<SubmitRouteResult>('POST', '/api/routes', input);
}

export function submitGym(input: SubmitGymInput): Promise<SubmitGymResult> {
  return sendJson<SubmitGymResult>('POST', '/api/gyms', input);
}

// ---------------------------------------------------------------------------
// Presence-gated actions -- BL-009/010/011/014/015/017/018
// ---------------------------------------------------------------------------

export function submitRouteVerification(
  routeId: string,
  input: SubmitRouteVerificationInput,
): Promise<SubmitRouteVerificationResult> {
  return sendJson<SubmitRouteVerificationResult>(
    'POST',
    `/api/routes/${routeId}/verifications`,
    input,
  );
}

export function submitGymVerification(
  gymId: string,
  input: SubmitGymVerificationInput,
): Promise<SubmitGymVerificationResult> {
  return sendJson<SubmitGymVerificationResult>(
    'POST',
    `/api/gyms/${gymId}/verifications`,
    input,
  );
}

export function voteOnGrade(
  routeId: string,
  input: VoteOnGradeInput,
): Promise<GradeConsensus> {
  return sendJson<GradeConsensus>(
    'POST',
    `/api/routes/${routeId}/grade-votes`,
    input,
  );
}

export function logClimb(
  routeId: string,
  input: LogClimbInput,
): Promise<ClimbLogResult> {
  return sendJson<ClimbLogResult>(
    'POST',
    `/api/routes/${routeId}/climb-logs`,
    input,
  );
}

// BL-024, Epic 5. Gym-scoped rather than route-scoped, mirroring
// submitGymVerification's URL shape.
export function checkInAtGym(
  gymId: string,
  input: CheckInInput,
): Promise<CheckInResult> {
  return sendJson<CheckInResult>('POST', `/api/gyms/${gymId}/check-ins`, input);
}

// ---------------------------------------------------------------------------
// Admin -- BL-012
// ---------------------------------------------------------------------------

// PATCH, not POST: this mutates an existing gym rather than creating anything.
// Gated server-side on SYSTEM_ADMIN (SessionGuard + RolesGuard, AR-17); the UI
// hides the entry point rather than showing it and letting the 403 explain.
export function adminVerifyGym(
  gymId: string,
  input: AdminVerifyGymInput,
): Promise<{ id: string; status: string; disciplinesOffered: string[] }> {
  return sendJson('PATCH', `/api/gyms/${gymId}/admin-verify`, input);
}

// ---------------------------------------------------------------------------
// Admin stewardship -- AR-51, BL-x07 / BL-x08 / BL-033 (Epic 7)
// ---------------------------------------------------------------------------

// BL-x07 / §14: the admin editor's read (includes archived entities).
export function fetchAdminGym(
  gymId: string,
  signal?: AbortSignal,
): Promise<AdminGymView> {
  return getJson<AdminGymView>(`/api/gyms/${gymId}`, signal);
}

export function fetchAdminRoute(
  routeId: string,
  signal?: AbortSignal,
): Promise<AdminRouteView> {
  return getJson<AdminRouteView>(`/api/routes/${routeId}`, signal);
}

// BL-x07 / §14: edit any field of any gym / climb, including the photo set.
// Only keys present in `input` change; the server rejects a lone latitude or
// longitude.
export function adminUpdateGym(
  gymId: string,
  input: AdminUpdateGymInput,
): Promise<AdminGymView> {
  return sendJson<AdminGymView>('PATCH', `/api/gyms/${gymId}`, input);
}

export function adminUpdateRoute(
  routeId: string,
  input: AdminUpdateRouteInput,
): Promise<{ id: string; name: string }> {
  return sendJson('PATCH', `/api/routes/${routeId}`, input);
}

// BL-x07: un-archive a force-archived gym / climb.
export function restoreGym(gymId: string): Promise<RestoreResult> {
  return sendJson<RestoreResult>('POST', `/api/gyms/${gymId}/restore`, {});
}

export function restoreRoute(routeId: string): Promise<RestoreResult> {
  return sendJson<RestoreResult>('POST', `/api/routes/${routeId}/restore`, {});
}

// BL-x07: the irreversible delete. UI gates this behind typing "DELETE".
export function hardDeleteGym(gymId: string): Promise<HardDeleteGymResult> {
  return sendJson<HardDeleteGymResult>('DELETE', `/api/gyms/${gymId}`, undefined);
}

export function hardDeleteRoute(
  routeId: string,
): Promise<HardDeleteRouteResult> {
  return sendJson<HardDeleteRouteResult>(
    'DELETE',
    `/api/routes/${routeId}`,
    undefined,
  );
}

// BL-035 / BL-x07: "take down" -- force-archive, no reason. Founding route
// cascades to its crag.
export function forceArchiveRoute(
  routeId: string,
): Promise<ForceArchiveRouteResult> {
  return sendJson<ForceArchiveRouteResult>(
    'POST',
    `/api/routes/${routeId}/force-archive`,
    {},
  );
}

export function forceArchiveGym(gymId: string): Promise<ForceArchiveGymResult> {
  return sendJson<ForceArchiveGymResult>(
    'POST',
    `/api/gyms/${gymId}/force-archive`,
    {},
  );
}

// BL-x08: the gym-information dispute queue.
export function fetchGymDisputes(
  signal?: AbortSignal,
): Promise<GymDisputeQueueItem[]> {
  return getJson<GymDisputeQueueItem[]>('/api/admin/gym-disputes', signal);
}

export function resolveGymDispute(
  disputeId: string,
): Promise<{ id: string; resolvedAt: string; alreadyResolved: boolean }> {
  return sendJson('POST', `/api/admin/gym-disputes/${disputeId}/resolve`, {});
}

// BL-033: the User Account Audit view + its four standalone actions.
export function fetchUserAudit(
  userId: string,
  signal?: AbortSignal,
): Promise<UserAuditView> {
  return getJson<UserAuditView>(`/api/admin/users/${userId}/audit`, signal);
}

export function applyAccountabilityAction(
  userId: string,
  input: ApplyAccountabilityActionInput,
): Promise<AccountabilityResult> {
  return sendJson<AccountabilityResult>(
    'POST',
    `/api/admin/users/${userId}/accountability`,
    input,
  );
}

// ---------------------------------------------------------------------------
// Moderation & notifications -- Epic 6, BL-027 / BL-028 / BL-030
// ---------------------------------------------------------------------------

// BL-027 / §14. Admin-only (SessionGuard + RolesGuard). Every PENDING asset
// with its reports nested.
export function fetchFlagQueue(signal?: AbortSignal): Promise<FlagQueueItem[]> {
  return getJson<FlagQueueItem[]>('/api/admin/flag-queue', signal);
}

// BL-028. Approve / Reject / Reject+Strike / Reject+Ban.
export function moderateMedia(
  mediaAssetId: string,
  input: ModerateMediaInput,
): Promise<ModerationResult> {
  return sendJson<ModerationResult>(
    'POST',
    `/api/admin/media/${mediaAssetId}/moderate`,
    input,
  );
}

// BL-030. A community report on a published asset -- any Verified Climber.
export function reportMedia(
  mediaAssetId: string,
  reason: string | undefined,
): Promise<{ mediaAssetId: string; moderationStatus: string }> {
  return sendJson('POST', `/api/media/${mediaAssetId}/reports`, { reason });
}

// The Alerts tab's feed (Epic 6 half of §19.2). `since` is the client's
// last_checked_timestamp -- omitted on first load, then the newest seen
// createdAt so the poll is incremental.
export function fetchNotifications(
  since?: string,
  signal?: AbortSignal,
): Promise<AppNotification[]> {
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return getJson<AppNotification[]>(`/api/notifications${query}`, signal);
}
