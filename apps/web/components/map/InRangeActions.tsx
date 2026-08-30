'use client';

import { CheckIcon, CrosshairIcon, LockIcon } from '@/components/shell/icons';
import { PROXIMITY_METERS } from '@/lib/geo';

// BL-021: "In-range action buttons appear only when the location is within
// 300m." The four actions are Foundation §5/§6/§7's presence-gated ones --
// check in, verify, vote on the grade, log a climb.
//
// Two things this component deliberately does NOT do:
//
//   1. It does not perform any of the actions. Each already has a built,
//      tested, 300m-gated endpoint (BL-009, BL-015, BL-017), but the forms
//      that would drive them -- photo upload, grade selector, outcome
//      picker -- are Sprint 1's still-open frontend punch list, not Epic 4.
//      Wiring a submit here with no form behind it would ship a button that
//      lies. `onAction` is the seam those forms plug into.
//   2. It does not treat the client's own distance check as authoritative.
//      The server re-checks with PostGIS on every one of those endpoints and
//      rejects at 301m regardless of what this rendered (BL-014). This is a
//      rendering decision only -- which is exactly what the acceptance
//      criterion asks for.
export function InRangeActions({
  inRange,
  onAction,
}: {
  inRange: boolean;
  onAction?: (action: 'CHECK_IN' | 'VERIFY' | 'VOTE' | 'LOG') => void;
}) {
  if (!inRange) {
    return (
      <div
        data-testid="actions-locked"
        className="flex items-start gap-2.5 rounded-[10px] border-[1.5px] border-clay-deep bg-clay-deep px-3 py-2.5 text-paper"
      >
        <LockIcon className="mt-[1px] h-4 w-4 shrink-0" />
        <p className="text-[11.5px] leading-snug">
          <span className="label-caps block text-[10px]">Action locked</span>
          You must be within {PROXIMITY_METERS} meters of this location to
          verify, vote or log climbs.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="actions-unlocked" className="space-y-2.5">
      <div className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-line bg-moss-wash px-3 py-2">
        <CheckIcon className="h-4 w-4 shrink-0 text-moss-deep" />
        <p className="text-[11.5px] font-semibold leading-snug text-ink">
          In range — actions unlocked
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          testId="action-verify"
          label="Verify Route"
          tone="ink"
          onClick={() => onAction?.('VERIFY')}
        />
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
        <ActionButton
          testId="action-check-in"
          label="Check-In"
          tone="clay"
          icon={<CrosshairIcon className="h-3.5 w-3.5" />}
          onClick={() => onAction?.('CHECK_IN')}
        />
      </div>
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
    clay: 'bg-clay-deep text-paper border-clay-deep',
    outline: 'bg-surface text-ink border-line',
  }[tone];

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] px-3 py-2.5 text-[12px] font-semibold ${toneClass}`}
    >
      {icon}
      {label}
    </button>
  );
}
