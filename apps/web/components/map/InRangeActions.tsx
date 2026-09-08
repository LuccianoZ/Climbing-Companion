'use client';

import { CrosshairIcon, LockIcon } from '@/components/shell/icons';
import { PROXIMITY_METERS } from '@/lib/geo';
import type { MapPinKind } from '@/lib/types';

export type InRangeAction = 'CHECK_IN' | 'VERIFY' | 'VOTE' | 'LOG';

// BL-021: "In-range action buttons appear only when the location is within
// 300m." The actions themselves are Foundation section 5/6/7's presence-gated
// ones. Epic 4 shipped this component as pure rendering with an `onAction`
// prop that went nowhere; the Sprint 1/2 backfill is what plugs the forms in
// behind it, and the shape below is unchanged except for three things it now
// knows about the thing being acted on.
//
// **Which actions exist depends on the pin's kind.** Grading and logging are
// per *route* (/api/routes/:routeId/...) and a gym has no child routes at all
// (Foundation section 4), so a gym panel offers verification and check-in
// only. Conversely check-in writes gym_checkins, which has a gym_id and no
// crag equivalent anywhere in the schema, so it is absent from a crag panel --
// the one place the approved mockup and the schema disagree (AR-36).
//
// **A VERIFIED thing offers no verify button.** AR-25: this is where BL-010's
// cascade becomes visible to a climber, rather than being a state they can
// only discover by being refused. The server agrees -- re-verifying answers
// 409 -- so hiding it removes a guaranteed failure, not a capability.
//
// **The client's distance check is still not authoritative.** lib/geo.ts uses
// haversine so the panel can decide what to render without a network round
// trip per GPS tick; the server re-checks with PostGIS on every one of these
// endpoints and rejects at 301m regardless (BL-014). This is a rendering
// decision only -- which is exactly what the acceptance criterion asks for.
export function InRangeActions({
  inRange,
  kind,
  canVerify,
  hasRoutes,
  onAction,
}: {
  inRange: boolean;
  kind: MapPinKind;
  canVerify: boolean;
  hasRoutes: boolean;
  onAction?: (action: InRangeAction) => void;
}) {
  if (!inRange) {
    return (
      <div
        data-testid="actions-locked"
        className="flex items-start gap-3 rounded-card border-l-4 border-clay bg-clay-wash px-4 py-3.5"
      >
        <LockIcon className="mt-[3px] h-[18px] w-[18px] shrink-0 text-clay-deep" />
        <p className="text-small leading-snug text-ink-soft">
          <span className="display block text-heading leading-none text-clay-deep">
            Action locked
          </span>
          You must be within {PROXIMITY_METERS} meters of this location to
          verify, vote or log climbs.
        </p>
      </div>
    );
  }

  const isCrag = kind === 'CRAG';

  return (
    <div data-testid="actions-unlocked" className="space-y-2.5">
      {/* flex-wrap, not a fixed 2-column grid: a verified gym offers exactly
          one action, and a lone button in a 2-col grid sits at half width
          looking like something failed to render beside it. */}
      <div className="flex flex-wrap gap-2">
        {canVerify && (isCrag ? hasRoutes : true) ? (
          <ActionButton
            testId="action-verify"
            label={isCrag ? 'Verify Route' : 'Verify Gym'}
            tone="ink"
            onClick={() => onAction?.('VERIFY')}
          />
        ) : null}

        {isCrag && hasRoutes ? (
          <>
            <ActionButton
              testId="action-vote"
              label="Vote on Grade"
              tone="ink"
              onClick={() => onAction?.('VOTE')}
            />
            <ActionButton
              testId="action-log"
              label="Log Climb"
              tone="outline"
              onClick={() => onAction?.('LOG')}
            />
          </>
        ) : null}

        {!isCrag ? (
          <ActionButton
            testId="action-check-in"
            label="Check-In"
            tone="clay"
            icon={<CrosshairIcon className="h-3.5 w-3.5" />}
            onClick={() => onAction?.('CHECK_IN')}
          />
        ) : null}
      </div>

      {/* Explains an otherwise-empty action row. Reaching this means every
          route here is verified (or a gym is), which is a good outcome rather
          than a broken panel -- so it should read as one. */}
      {!canVerify ? (
        <p
          data-testid="nothing-to-verify"
          className="text-caption leading-snug text-ink-faint"
        >
          {isCrag
            ? 'Every route here is verified — nothing left to confirm.'
            : 'This gym is verified — nothing left to confirm.'}
        </p>
      ) : null}
    </div>
  );
}

function ActionButton({
  label,
  testId,
  tone,
  icon,
  onClick,
}: {
  label: string;
  testId: string;
  tone: 'ink' | 'clay' | 'outline';
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  const toneClass = {
    ink: 'bg-ink text-paper border-ink',
    clay: 'field-accent border-clay shadow-accent',
    outline: 'bg-transparent text-ink border-line',
  }[tone];

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      // min-h-11 is the 44px touch floor; these are tapped one-handed at a
      // crag, often in gloves.
      className={`press display flex min-h-12 min-w-[45%] flex-1 items-center justify-center gap-2 rounded-control border px-3 py-3 text-heading leading-none ${toneClass}`}
    >
      {icon}
      {label}
    </button>
  );
}
