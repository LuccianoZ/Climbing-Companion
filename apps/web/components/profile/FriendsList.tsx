'use client';

import { useState } from 'react';
import type { FriendSummary } from '@/lib/types';

// BL-041 (AR-55): the "Your friends" list. With no user directory, this
// list plus its unadd button is the whole friend-management surface --
// friends only arrive through a redeemed invite link (InviteFriendCard).
export function FriendsList({
  friends,
  onUnadd,
}: {
  friends: FriendSummary[];
  onUnadd: (friendshipId: string) => Promise<void>;
}) {
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function handleUnadd(friendshipId: string) {
    setActingOn(friendshipId);
    try {
      await onUnadd(friendshipId);
    } finally {
      setActingOn(null);
    }
  }

  if (friends.length === 0) {
    return (
      <p data-testid="friends-empty" className="text-[12px] text-ink-faint">
        No friends yet. Send someone your invite link to connect.
      </p>
    );
  }

  return (
    <ul data-testid="friends-list" className="space-y-2">
      {friends.map((friend) => {
        const busy = actingOn === friend.friendshipId;
        return (
          <li
            key={friend.friendshipId}
            data-testid="friend-row"
            className="flex items-center justify-between gap-2 rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-[12px] font-bold text-ink">
                {friend.displayName}
              </p>
              <p className="truncate text-[10px] text-ink-faint">
                {friend.email}
              </p>
            </div>
            <button
              type="button"
              data-testid="unadd-friend"
              disabled={busy}
              onClick={() => handleUnadd(friend.friendshipId)}
              className="shrink-0 rounded-[8px] border-[1.5px] border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-ink-soft disabled:opacity-50"
            >
              {busy ? 'Removing…' : 'Unadd'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
