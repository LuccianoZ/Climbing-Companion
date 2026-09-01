'use client';

import { ActionSheet } from '@/components/ui/ActionSheet';

// Check-in is BL-024 -- Epic 5, Sprint 3, table `gym_checkins` -- and is not
// built on either side yet. Two things follow, and they pull in opposite
// directions, so both are recorded in AR-36:
//
//   * The button is shown for gyms only. gym_checkins has a gym_id and no
//     crag or route equivalent anywhere in the schema, so "check in at a
//     crag" is not a thing this app will ever do, and offering it on a crag
//     panel would promise a feature that has no table behind it. The mockup
//     draws Check-In on a crag panel; that is the one place the design and
//     the schema disagree, and the schema wins.
//   * Where it is shown, it opens this instead of firing a request. Same
//     convention as AppShell's TabPlaceholder: name the owning story, so
//     "unbuilt" is never mistaken for "broken" during a demo.

export function UnbuiltActionSheet({
  title,
  owningStory,
  description,
  onClose,
}: {
  title: string;
  owningStory: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <ActionSheet
      title={title}
      testId="unbuilt-action-sheet"
      onClose={onClose}
    >
      <p className="text-[12.5px] leading-relaxed text-ink-soft">
        {description}
      </p>
      <p
        data-testid="owning-story"
        className="label-caps inline-block rounded-full border border-line-soft bg-paper px-3 py-1.5 text-[10px] text-ink-faint"
      >
        {owningStory}
      </p>
      <button
        type="button"
        data-testid="unbuilt-dismiss"
        onClick={onClose}
        className="w-full rounded-[10px] border-[1.5px] border-line bg-surface px-4 py-3 text-[13px] font-bold text-ink"
      >
        Close
      </button>
    </ActionSheet>
  );
}
