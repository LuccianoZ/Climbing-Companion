'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireSession } from '@/components/auth/RequireSession';
import { ApiError, redeemFriendInviteLink } from '@/lib/api';
import type { RedeemInviteResult } from '@/lib/types';

// BL-040 / BL-041 (AR-55): the redeem landing page a friend-invite URL
// points at. RequireSession bounces a signed-out visitor to
// /login?next=/friends/invite/<token> and back, so by the time this body
// renders the viewer is authenticated -- then it POSTs the redemption once
// and shows the outcome.
//
// The status codes map straight from FriendInviteLinksService.redeem:
//   400 -> your own link      404 -> unknown token
//   410 -> consumed or expired

type Phase =
  | { kind: 'redeeming' }
  | { kind: 'done'; result: RedeemInviteResult }
  | { kind: 'error'; status: number | null };

function RedeemBody({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'redeeming' });
  // A redeem is single-use; StrictMode double-invoke or a re-render must not
  // fire it twice (the second call would 410 on the link this one consumed).
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    let live = true;
    redeemFriendInviteLink(token)
      .then((result) => {
        if (live) setPhase({ kind: 'done', result });
      })
      .catch((err: unknown) => {
        if (!live) return;
        const status = err instanceof ApiError ? err.status : null;
        setPhase({ kind: 'error', status });
      });

    return () => {
      live = false;
    };
  }, [token]);

  return (
    <AppShell>
      <div
        data-testid="redeem-invite"
        className="mx-auto mt-10 max-w-[320px] space-y-3 text-center"
      >
        {phase.kind === 'redeeming' ? (
          <p
            data-testid="redeem-pending"
            className="py-8 text-[12px] text-ink-faint"
          >
            Connecting you…
          </p>
        ) : null}

        {phase.kind === 'done' ? (
          <>
            <h1
              data-testid="redeem-success"
              className="text-[17px] font-bold tracking-tight text-ink"
            >
              {phase.result.outcome === 'ALREADY_FRIENDS'
                ? "You're already friends"
                : "You're now friends"}
            </h1>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {phase.result.outcome === 'ALREADY_FRIENDS'
                ? 'This link connected you to someone you were already friends with — nothing changed.'
                : 'You can see them on your friends list now.'}
            </p>
            <Link
              href="/profile"
              data-testid="redeem-go-profile"
              className="inline-block rounded-[8px] border-[1.5px] border-line bg-moss-wash px-3 py-1.5 text-[11px] font-bold text-moss-deep"
            >
              Go to your profile
            </Link>
          </>
        ) : null}

        {phase.kind === 'error' ? (
          <>
            <h1
              data-testid="redeem-error"
              className="text-[17px] font-bold tracking-tight text-clay-deep"
            >
              {phase.status === 400
                ? "That's your own link"
                : phase.status === 410
                  ? 'This link is no longer valid'
                  : "We couldn't use this link"}
            </h1>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {phase.status === 400
                ? 'An invite link connects you to someone else — send it to a friend instead.'
                : phase.status === 410
                  ? 'It has already been used or has expired. Ask your friend to send a new one.'
                  : 'The link may be mistyped or was never valid. Ask your friend to send a new one.'}
            </p>
            <Link
              href="/"
              data-testid="redeem-go-map"
              className="inline-block rounded-[8px] border-[1.5px] border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-ink-soft"
            >
              Back to the map
            </Link>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export function RedeemInvite({ token }: { token: string }) {
  return (
    <RequireSession>
      <RedeemBody token={token} />
    </RequireSession>
  );
}
