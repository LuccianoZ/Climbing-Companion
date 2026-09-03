'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchGymDisputes, resolveGymDispute } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import type { GymDisputeQueueItem } from '@/lib/types';

// BL-x08 / Foundation §14: the Admin Dashboard's gym-information dispute
// queue. A "No, the information is inaccurate" answer from a verifier within
// 300m (BL-x06) lands here. The admin either applies a correction (Edit gym,
// BL-x07) or dismisses it -- either way, Resolve stamps resolved_at and the
// row leaves the queue.

export function GymDisputeQueue() {
  const [disputes, setDisputes] = useState<GymDisputeQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  // Bumped after a resolve to re-run the load effect.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchGymDisputes(controller.signal)
      .then((rows) => {
        setDisputes(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(messageFor('GYM_DISPUTE', err));
      });
    return () => controller.abort();
  }, [refreshKey]);

  async function onResolve(id: string) {
    setResolving(id);
    try {
      await resolveGymDispute(id);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(messageFor('GYM_DISPUTE', err));
    } finally {
      setResolving(null);
    }
  }

  if (error) {
    return (
      <p
        data-testid="dispute-queue-error"
        className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
      >
        {error}
      </p>
    );
  }

  if (disputes === null) {
    return (
      <p data-testid="dispute-queue-loading" className="text-[12px] text-ink-faint">
        Loading disputes…
      </p>
    );
  }

  if (disputes.length === 0) {
    return (
      <p
        data-testid="dispute-queue-empty"
        className="rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-3 text-[12px] text-ink-soft"
      >
        No open gym-information disputes.
      </p>
    );
  }

  return (
    <ul data-testid="dispute-queue" className="max-w-3xl space-y-2.5">
      {disputes.map((dispute) => (
        <li
          key={dispute.id}
          data-testid="dispute-row"
          data-dispute-id={dispute.id}
          data-gym-id={dispute.gymId}
          className="card space-y-2 p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-ink">{dispute.gymName}</p>
              <p className="font-mono text-[10px] text-ink-faint">
                reporter {dispute.reporterUserId} ·{' '}
                {new Date(dispute.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <p className="rounded-[8px] border border-line-soft bg-paper px-2.5 py-2 text-[12px] leading-relaxed text-ink-soft">
            {dispute.detail}
          </p>
          <div className="flex gap-2">
            <Link
              href={`/admin/stewardship/gym/${dispute.gymId}`}
              data-testid="dispute-edit-gym"
              className="rounded-[8px] border-[1.5px] border-ink bg-ink px-3 py-1.5 text-[11.5px] font-semibold text-paper"
            >
              Edit gym
            </Link>
            <button
              type="button"
              data-testid="dispute-resolve"
              disabled={resolving === dispute.id}
              onClick={() => onResolve(dispute.id)}
              className="rounded-[8px] border-[1.5px] border-line-soft px-3 py-1.5 text-[11.5px] font-semibold text-ink-soft disabled:opacity-45"
            >
              {resolving === dispute.id ? 'Resolving…' : 'Resolve / dismiss'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
