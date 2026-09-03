'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchFlagQueue } from '@/lib/api';
import {
  MEDIA_PURPOSE_LABELS,
  isVerificationPhoto,
  type FlagQueueItem,
} from '@/lib/types';
import { ModerationDecisionPanel } from './ModerationDecisionPanel';

// BL-027 / §14. The Global Flag Queue: every PENDING asset (a fresh upload or
// a published one a community report flipped back), each with its reports and
// an inline Approve / Reject panel. Dense multi-column desktop layout
// (Foundation §17, AR-28) — this renders inside AdminShell, never the phone
// shell.
//
// The thumbnail is a plain <img> against GET /api/media/:id: an admin's
// session lets OptionalSessionGuard resolve them, so BL-027's visibility gate
// serves them the PENDING bytes (a signed-out visitor would get a 404).

export function FlagQueue() {
  const [items, setItems] = useState<FlagQueueItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    fetchFlagQueue(signal)
      .then((rows) => {
        setItems(rows);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (failed) {
    return (
      <p
        data-testid="flag-queue-error"
        className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
      >
        Couldn&apos;t load the flag queue. Check that the API is running.
      </p>
    );
  }

  if (items === null) {
    return (
      <p data-testid="flag-queue-loading" className="text-[12px] text-ink-faint">
        Loading the queue…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p
        data-testid="flag-queue-empty"
        className="rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-3 text-[12px] text-ink-soft"
      >
        Nothing pending. Every uploaded photo has been reviewed.
      </p>
    );
  }

  return (
    <div data-testid="flag-queue" className="space-y-3">
      {items.map((item) => {
        const open = expanded === item.mediaAssetId;
        return (
          <div
            key={item.mediaAssetId}
            data-testid="flag-queue-row"
            data-media-id={item.mediaAssetId}
            data-purpose={item.purpose}
            className="card flex flex-col gap-3 p-3 lg:flex-row"
          >
            {/* eslint-disable-next-line @next/next/no-img-element --
                next/image cannot serve an authenticated API route (the
                loader strips credentials), and these are small,
                admin-only thumbnails, not a public gallery. */}
            <img
              src={`/api/media/${item.mediaAssetId}`}
              alt="Pending upload"
              className="h-28 w-40 shrink-0 rounded-[8px] border border-line-soft object-cover"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-line-soft bg-paper px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">
                  {MEDIA_PURPOSE_LABELS[item.purpose]}
                </span>
                {isVerificationPhoto(item.purpose) ? (
                  <span
                    data-testid="flag-queue-verification-badge"
                    className="rounded-full border border-clay-deep bg-clay-wash px-2 py-0.5 text-[10px] font-semibold text-clay-deep"
                  >
                    Rejection strikes uploader (AR-1)
                  </span>
                ) : null}
                <span className="font-mono text-[10.5px] text-ink-faint">
                  {item.mediaAssetId}
                </span>
              </div>

              <p className="mt-1 font-mono text-[11px] text-ink-faint">
                uploaded {new Date(item.createdAt).toLocaleString()} · owner{' '}
                {item.ownerUserId}
              </p>

              {item.reports.length > 0 ? (
                <ul
                  data-testid="flag-queue-reports"
                  className="mt-2 space-y-1 border-l-2 border-clay-deep/40 pl-2"
                >
                  {item.reports.map((r) => (
                    <li key={r.id} className="text-[11px] text-ink-soft">
                      Reported by {r.reportedBy}
                      {r.reason ? ` — “${r.reason}”` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}

              <button
                type="button"
                data-testid="flag-queue-review"
                onClick={() =>
                  setExpanded(open ? null : item.mediaAssetId)
                }
                className="mt-2 rounded-[7px] border-[1.5px] border-ink bg-ink px-3 py-1.5 text-[11px] font-semibold text-paper"
              >
                {open ? 'Close' : 'Review'}
              </button>

              {open ? (
                <div className="mt-3">
                  <ModerationDecisionPanel
                    item={item}
                    onResolved={() => {
                      setExpanded(null);
                      load();
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
