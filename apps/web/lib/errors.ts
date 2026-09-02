import { ApiError } from './api';
import { PROXIMITY_METERS } from './geo';

// AR-26. Every failure a climber can hit is resolved through one table keyed
// on (action, status), rather than each call site inventing its own copy or
// -- worse -- rendering the server's own prose. Two reasons that matters
// here:
//
//   1. The server's messages are written for a developer reading a log
//      ("Verifier must be within 300m of the route"), and several of them
//      name internals a climber has no model for. Sprint1-Frontend-Scope
//      section 5 asks specifically for plain language, not raw error codes.
//   2. The same status means different things per endpoint. A 409 on
//      register is "that email is taken"; a 409 on verify is "you already
//      verified this one". A single generic map keyed on status alone would
//      be wrong for one of them.
//
// The one place the status is genuinely not enough: both verification
// endpoints answer 403 for two different refusals -- the caller is the
// original submitter, or the caller is too far away. Only the server's
// message distinguishes them, so that (and only that) is matched on text,
// with a safe fallback if the wording is ever changed on the API side.

export type ApiAction =
  | 'LOGIN'
  | 'REGISTER'
  | 'LOGOUT'
  | 'RESET_REQUEST'
  | 'RESET_CONFIRM'
  | 'UPLOAD'
  | 'SUBMIT_ROUTE'
  | 'SUBMIT_GYM'
  | 'VERIFY_ROUTE'
  | 'VERIFY_GYM'
  | 'VOTE'
  | 'LOG_CLIMB'
  | 'ADMIN_VERIFY_GYM';

// A request that never reached the server at all: fetch rejects with a
// TypeError rather than resolving to a non-ok Response, so this never becomes
// an ApiError and needs its own branch. Worth its own message -- "check your
// connection" is actionable where "something went wrong" is not, and at a
// crag it is usually the true cause.
const OFFLINE =
  "We couldn't reach Climbing Companion. Check your connection and try again.";

const UNEXPECTED =
  'Something went wrong on our end. Please try again in a moment.';

const SESSION_EXPIRED = 'Your session has expired. Please log in again.';

const TOO_FAR = `You're too far away — you need to be within ${PROXIMITY_METERS} meters to do this.`;

const TABLE: Record<ApiAction, Record<number, string>> = {
  LOGIN: {
    // Deliberately as vague as the server's own answer. AuthService returns
    // one generic message for "no such email" and "wrong password" alike so
    // the response cannot be used to enumerate accounts; saying "no account
    // with that email" here would leak exactly what that guards.
    401: 'That email and password combination is not recognised.',
    400: 'Enter a valid email address and your password.',
  },
  REGISTER: {
    409: 'An account already exists for that email address. Try logging in instead.',
    400: 'Check the form: your email must be valid and your password at least 8 characters.',
  },
  LOGOUT: {
    401: SESSION_EXPIRED,
  },
  RESET_REQUEST: {
    400: 'Enter a valid email address.',
  },
  RESET_CONFIRM: {
    // AuthService answers 401 for an unknown, expired and already-used token
    // alike, so the copy has to cover all three honestly.
    401: 'That reset link is no longer valid — it may have expired or already been used. Request a new one.',
    400: 'Your new password must be at least 8 characters.',
  },
  UPLOAD: {
    // Both also pre-checked client-side (BL-008), so reaching either of these
    // means the browser disagreed with the server about the file. Say what
    // the limit actually is rather than repeating "invalid file".
    413: 'That photo is over the 2MB limit. Try a smaller image.',
    415: 'Photos must be JPEG or PNG.',
    400: 'Choose a photo to upload.',
    401: SESSION_EXPIRED,
  },
  SUBMIT_ROUTE: {
    400: 'Check the form — some required details are missing or invalid.',
    401: SESSION_EXPIRED,
  },
  SUBMIT_GYM: {
    400: 'Check the form — a gym needs a name and a location.',
    401: SESSION_EXPIRED,
  },
  VERIFY_ROUTE: {
    404: 'This route no longer exists. It may have been archived.',
    409: 'You have already verified this route.',
    401: SESSION_EXPIRED,
    400: 'Add a photo and a grade before verifying.',
  },
  VERIFY_GYM: {
    404: 'This gym no longer exists. It may have been archived.',
    409: 'You have already verified this gym.',
    401: SESSION_EXPIRED,
    400: 'Add a photo and pick at least one discipline before verifying.',
  },
  VOTE: {
    403: TOO_FAR,
    404: 'This route no longer exists. It may have been archived.',
    401: SESSION_EXPIRED,
    400: 'Pick a grade before voting.',
  },
  LOG_CLIMB: {
    403: TOO_FAR,
    404: 'This route no longer exists. It may have been archived.',
    401: SESSION_EXPIRED,
  },
  ADMIN_VERIFY_GYM: {
    403: 'Only a system administrator can verify a gym directly.',
    404: 'This gym no longer exists.',
    409: 'This gym is already verified.',
    401: SESSION_EXPIRED,
    400: 'Select at least one discipline.',
  },
};

// The 409 wording above covers the duplicate case, which is by far the more
// common one. VerificationService throws the same 409 for a route that is
// already VERIFIED, distinguishable only by message -- and the UI hides the
// verify button in that state (AR-25), so hitting it means a second climber
// verified the route while this sheet was open. Worth its own sentence.
const ALREADY_VERIFIED_HINT = 'already verified';
const ALREADY_VERIFIED_COPY = {
  VERIFY_ROUTE:
    'This route reached four verifications while you had this open — it is now verified.',
  VERIFY_GYM:
    'This gym reached four verifications while you had this open — it is now verified.',
} as const;

// The two different 403s. Matched on the server's wording because nothing
// else separates them; if either message is ever reworded on the API side,
// the fallback below is still a true statement about a 403 from these
// endpoints, so the failure mode is a vaguer message rather than a wrong one.
const OWN_SUBMISSION_HINT = 'cannot verify their own';

function verificationForbidden(
  action: 'VERIFY_ROUTE' | 'VERIFY_GYM',
  serverMessage: string | null,
): string {
  const noun = action === 'VERIFY_ROUTE' ? 'route' : 'gym';
  if (serverMessage?.includes(OWN_SUBMISSION_HINT)) {
    return `You submitted this ${noun}, so you can't be one of its verifiers. It needs four other climbers.`;
  }
  if (serverMessage?.toLowerCase().includes('within')) {
    return TOO_FAR;
  }
  return `You can't verify this ${noun} from here.`;
}

// The single entry point every screen uses. Takes the raw thrown value --
// not a pre-narrowed ApiError -- so no call site has to remember which
// failures are ApiErrors and which are network faults.
export function messageFor(action: ApiAction, error: unknown): string {
  if (!(error instanceof ApiError)) {
    return OFFLINE;
  }

  if (
    (action === 'VERIFY_ROUTE' || action === 'VERIFY_GYM') &&
    error.status === 403
  ) {
    return verificationForbidden(action, error.serverMessage);
  }

  if (
    (action === 'VERIFY_ROUTE' || action === 'VERIFY_GYM') &&
    error.status === 409 &&
    error.serverMessage?.toLowerCase().includes(ALREADY_VERIFIED_HINT) &&
    !error.serverMessage.toLowerCase().includes('you have already')
  ) {
    return ALREADY_VERIFIED_COPY[action];
  }

  const known = TABLE[action][error.status];
  if (known) {
    return known;
  }

  // A 5xx, or a 4xx this action has no entry for. Never fall through to the
  // server's own text: it is written for a log, and at worst it names a
  // column or a constraint.
  return UNEXPECTED;
}

// Some screens need to know a failure was specifically "not logged in" so
// they can send the climber to /login rather than render an error in place.
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
