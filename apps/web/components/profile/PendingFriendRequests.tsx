'use client';

import { useState } from 'react';
import type { PendingFriendRequest } from '@/lib/types';

// BL-x11 (AR-53, Sept 7 2026): the "Pending Friend Requests" view Foundation
// §12 names explicitly, pulled forward from Epic 9 because Gym Streak
// visibility depends on a friend relation existing. Deliberately no "send a
// request" affordance here -- there is no user directory yet (BL-041 is
// Epic 9), so nothing in this app can resolve a name/email the sender picks
// into a userId (Foundation §21 risk 11). Same reasoning as AR-34/AR-48: a
// control with nowhere to reliably live is worse than an absent one.
export function PendingFriendRequests({
  requests,
  onAccept,
  onDecline,
}: {
  requests: PendingFriendRequest[];
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}) {
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function handle(id: string, action: (id: string) => Promise<void>) {
    setActingOn(id);
    try {
      await action(id);
    } finally {
      setActingOn(null);
    }
  }

  if (requests.length === 0) {
    return (
      <p
        data-testid="pending-friend-requests-empty"
        className="text-[12px] text-ink-faint"
      >
        No pending friend requests.
      </p>
    );
  }

  return (
    <ul data-testid="pending-friend-requests" className="space-y-2">
      {requests.map((request) => {
        const busy = actingOn === request.id;
        return (
          <li
            key={request.id}
            data-testid="pending-friend-request-row"
            className="flex items-center justify-between gap-2 rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2"
          >
            <div>
              <p className="text-[12px] font-bold text-ink">
                {request.requesterDisplayName}
              </p>
              <p className="text-[10px] text-ink-faint">
                {request.requesterEmail}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="accept-friend-request"
                disabled={busy}
                onClick={() => handle(request.id, onAccept)}
                className="rounded-[8px] border-[1.5px] border-line bg-moss-wash px-2.5 py-1 text-[11px] font-bold text-moss-deep disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                data-testid="decline-friend-request"
                disabled={busy}
                onClick={() => handle(request.id, onDecline)}
                className="rounded-[8px] border-[1.5px] border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-ink-soft disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
