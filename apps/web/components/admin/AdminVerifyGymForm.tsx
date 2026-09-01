'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { adminVerifyGym, fetchPinDetail } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import {
  GYM_DISCIPLINES,
  GYM_DISCIPLINE_LABELS,
  type GymDetail,
  type GymDiscipline,
} from '@/lib/types';

// BL-012. The admin bypass of the four-verifier gate, and the one verification
// path in the app with no photo and no proximity check at all -- an admin
// verifying a gym they have confirmed by other means is not standing at it.
//
// The disciplines here are entered directly rather than unioned from
// gym_verifications rows (AR-17): when this path is used there may be zero
// such rows to union. That is the substantive difference from BL-011, and it
// is why this form asks the admin to state the answer rather than confirm one.
//
// Nothing on this screen is a second access check. RolesGuard answers 403 to a
// non-admin regardless (AR-17), and RequireSession(requireAdmin) keeps the
// page from rendering for one -- this component assumes both have already
// happened.

export function AdminVerifyGymForm({ gymId }: { gymId: string }) {
  const [gym, setGym] = useState<GymDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [disciplines, setDisciplines] = useState<GymDiscipline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    fetchPinDetail('GYM', gymId)
      .then((detail) => {
        if (live && detail.kind === 'GYM') {
          setGym(detail);
        }
      })
      .catch(() => {
        if (live) {
          setLoadFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, [gymId]);

  function toggle(item: GymDiscipline) {
    setDisciplines((current) =>
      current.includes(item)
        ? current.filter((entry) => entry !== item)
        : [...current, item],
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (disciplines.length === 0) {
      return;
    }

    setPending(true);
    try {
      await adminVerifyGym(gymId, { disciplinesOffered: disciplines });
      setDone(true);
    } catch (submitError) {
      setError(messageFor('ADMIN_VERIFY_GYM', submitError));
    } finally {
      setPending(false);
    }
  }

  if (loadFailed) {
    return (
      <p
        data-testid="admin-gym-load-error"
        className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
      >
        Couldn&apos;t load that gym. It may have been archived.
      </p>
    );
  }

  if (!gym) {
    return (
      <p data-testid="admin-gym-loading" className="text-[12px] text-ink-faint">
        Loading gym…
      </p>
    );
  }

  if (done) {
    return (
      <div data-testid="admin-verify-success" className="card max-w-xl space-y-3 p-4">
        <p className="text-[13.5px] font-bold text-moss-deep">
          {gym.name} is verified.
        </p>
        <p className="text-[12px] leading-relaxed text-ink-soft">
          It now lists{' '}
          {disciplines.map((item) => GYM_DISCIPLINE_LABELS[item]).join(', ')},
          and is flagged as verified directly by an admin rather than by four
          climbers.
        </p>
        <Link
          href="/admin/gyms"
          data-testid="admin-back-to-queue"
          className="inline-block rounded-[8px] border-[1.5px] border-ink bg-ink px-3.5 py-2 text-[12px] font-semibold text-paper"
        >
          Back to the queue
        </Link>
      </div>
    );
  }

  // The server answers 409 here (AR-17's "once VERIFIED, unavailable going
  // forward" convention). Saying so before the click is better than after it.
  if (gym.status === 'VERIFIED') {
    return (
      <div data-testid="admin-already-verified" className="card max-w-xl space-y-3 p-4">
        <p className="text-[13.5px] font-bold text-ink">
          {gym.name} is already verified.
        </p>
        <p className="text-[12px] leading-relaxed text-ink-soft">
          Re-verification is unavailable once a gym reaches VERIFIED, whether
          it got there through four climbers or an admin.
        </p>
        <Link
          href="/admin/gyms"
          className="inline-block rounded-[8px] border-[1.5px] border-line px-3.5 py-2 text-[12px] font-semibold text-ink"
        >
          Back to the queue
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      data-testid="admin-verify-gym-form"
      data-gym-id={gym.id}
      className="card max-w-xl space-y-4 p-4"
    >
      <div>
        <p className="label-caps text-[9px] text-ink-faint">Gym</p>
        <p className="text-[15px] font-bold text-ink">{gym.name}</p>
        <p className="font-mono text-[11px] text-ink-faint">
          {gym.latitude.toFixed(5)}, {gym.longitude.toFixed(5)}
        </p>
      </div>

      <fieldset data-testid="admin-discipline-choice" className="space-y-2">
        <legend className="label-caps text-[9.5px] text-ink-faint">
          Disciplines offered *
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GYM_DISCIPLINES.map((item) => {
            const checked = disciplines.includes(item);
            return (
              <label
                key={item}
                data-testid={`admin-discipline-${item}`}
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-[8px] border-[1.5px] px-2.5 py-2 text-[11.5px] font-medium',
                  checked
                    ? 'border-ink bg-paper text-ink'
                    : 'border-line-soft bg-surface text-ink-soft',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  value={item}
                  checked={checked}
                  onChange={() => toggle(item)}
                  className="h-3.5 w-3.5 accent-[color:var(--color-clay-deep)]"
                />
                {GYM_DISCIPLINE_LABELS[item]}
              </label>
            );
          })}
        </div>
        <p className="text-[10.5px] leading-snug text-ink-faint">
          Entered directly, not aggregated — this path exists precisely for
          gyms with no community verifications to union.
        </p>
      </fieldset>

      {error ? (
        <p
          role="alert"
          data-testid="admin-verify-error"
          className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="admin-verify-submit"
        disabled={pending || disciplines.length === 0}
        className="rounded-[8px] border-[1.5px] border-ink bg-ink px-4 py-2.5 text-[12.5px] font-bold text-paper disabled:opacity-45"
      >
        {pending ? 'Verifying…' : 'Verify gym directly'}
      </button>
    </form>
  );
}
