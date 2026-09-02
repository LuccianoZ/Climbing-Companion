'use client';

import { useState, type FormEvent } from 'react';
import {
  ActionError,
  ActionSheet,
  ActionSubmit,
  ActionSuccess,
} from '@/components/ui/ActionSheet';
import { checkInAtGym } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import type { CheckInResult, GymDetail } from '@/lib/types';

// BL-024, Epic 5. A check-in carries no data of its own beyond "I am here"
// -- gym_checkins has no column this form would populate besides the FKs
// and timestamp, both resolved server-side (Architecture.md §5) -- so this
// is the simplest of the in-range action sheets: one confirm button, no
// fields. It still opens as a sheet rather than firing on tap, matching
// every other in-range action (AR-25): the 300m re-check happens
// server-side regardless of what the client already rendered as "in
// range", so the confirm step is genuine, not decorative.
//
// AR-39: BL-025 (a self-recorded per-facility grade tier, originally
// scoped alongside check-in under this same Epic 5) was cut from scope
// before implementation began. There is no tier field here and none is
// planned -- this sheet does check-in and nothing else.
export function CheckInSheet({
  gym,
  viewer,
  onClose,
  onCompleted,
}: {
  gym: GymDetail;
  viewer: { latitude: number; longitude: number };
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CheckInResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const outcome = await checkInAtGym(gym.id, {
        latitude: viewer.latitude,
        longitude: viewer.longitude,
      });
      setResult(outcome);
      onCompleted();
    } catch (submitError) {
      setError(messageFor('CHECK_IN', submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <ActionSheet
      title="Check in"
      subtitle={gym.name}
      testId="check-in-sheet"
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-3">
          <ActionSuccess message={`Checked in at ${gym.name}.`} />
          <button
            type="button"
            data-testid="check-in-done"
            onClick={onClose}
            className="w-full rounded-[10px] border-[1.5px] border-ink bg-ink px-4 py-3 text-[13px] font-bold text-paper"
          >
            Done
          </button>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <p
            data-testid="check-in-copy"
            className="text-[11.5px] leading-relaxed text-ink-soft"
          >
            Confirm you&apos;re at {gym.name} right now. Check-ins aren&apos;t
            limited to once — drop by as often as you like.
          </p>

          <ActionError message={error} />

          <ActionSubmit
            testId="check-in-submit"
            tone="clay"
            label="Check in"
            pendingLabel="Checking in…"
            pending={pending}
          />
        </form>
      )}
    </ActionSheet>
  );
}
