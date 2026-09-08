'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { fetchNotifications } from '@/lib/api';
import { useSession } from '@/lib/session';
import { StaggerItem, StaggerList } from '@/components/ui/motion';
import type { AppNotification, NotificationType } from '@/lib/types';

// The Alerts tab (6-screen mockup's Notifications panel). Foundation §12: it
// covers exactly three events — friend added, image rejected, strike issued.
// Epic 6 raises the two moderation ones (BL-028); FRIEND_ADDED is raised when
// someone redeems this user's invite link (BL-040, AR-55). An unknown type
// renders thinly rather than crashing.
//
// The image-rejected and strike cards deliberately do not show the reason:
// Foundation §12 says both "direct the user to their email for the reasoning".
// AR-44: the mockup's "Strike 1 of 3" counter is not shown — the notifications
// table carries no payload and §19.2 keeps it that way; the count lives in
// the email and, later, the Admin Dashboard's per-user audit.
//
// "Mark all read" is client-side (AR-44): there is no read_at column. The
// last-seen timestamp lives in localStorage, and a notification newer than it
// renders with an unread dot.

const POLL_INTERVAL_MS = 10_000;
const LAST_SEEN_KEY = 'cc.alerts.lastSeen';

function readLastSeen(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeLastSeen(value: string): void {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, value);
  } catch {
    // Private windows / disabled storage — the feature degrades to "nothing
    // is ever marked read", which is harmless.
  }
}

const COPY: Record<
  NotificationType,
  { title: string; body: string; tone: 'warn' | 'neutral' }
> = {
  IMAGE_REJECTED: {
    title: 'Photo rejected',
    body: 'A photo you uploaded was removed by an administrator. Check your email for the reason.',
    tone: 'warn',
  },
  STRIKE_ISSUED: {
    title: 'Community guidelines violation',
    body: 'A moderation strike was issued on your account. Three strikes result in a suspension. Check your email for the reason.',
    tone: 'warn',
  },
  FRIEND_ADDED: {
    title: 'New friend',
    body: 'Someone used your invite link and is now on your friends list. Find them on your Profile.',
    tone: 'neutral',
  },
};

export function AlertsScreen() {
  const { status } = useSession();
  const router = useRouter();

  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Lazy initializer rather than an effect: reading localStorage is a one-off
  // and calling setState from an effect body is the pattern React 19 / Next 16
  // reject (see lib/session.tsx's note). window is absent during SSR, which
  // readLastSeen's try/catch turns into null.
  const [lastSeen, setLastSeen] = useState<string | null>(() => readLastSeen());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login?next=%2Falerts');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    let live = true;

    // The setState calls sit inside .then/.catch callbacks rather than in a
    // function called from the effect body — the shape lib/session.tsx uses to
    // stay clear of React 19's set-state-in-effect rule.
    const poll = () => {
      fetchNotifications()
        .then((rows) => {
          if (live) {
            setItems(rows);
            setFailed(false);
          }
        })
        .catch(() => {
          if (live) {
            setFailed(true);
          }
        });
    };

    // Foundation §19.2: pause polling while the tab is hidden.
    const start = () => {
      if (timer.current === null) {
        timer.current = setInterval(poll, POLL_INTERVAL_MS);
      }
    };
    const stop = () => {
      if (timer.current !== null) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        poll();
        start();
      }
    };

    poll();
    if (document.visibilityState === 'visible') {
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      live = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [status]);

  function markAllRead() {
    const newest = items?.[0]?.createdAt ?? new Date().toISOString();
    writeLastSeen(newest);
    setLastSeen(newest);
  }

  if (status !== 'authenticated') {
    return (
      <AppShell>
        <p
          data-testid={
            status === 'loading' ? 'session-loading' : 'session-redirecting'
          }
          className="py-10 text-center text-caption text-ink-faint"
        >
          {status === 'loading' ? 'Checking your session…' : 'Taking you to login…'}
        </p>
      </AppShell>
    );
  }

  const unreadCount =
    items?.filter((n) => !lastSeen || n.createdAt > lastSeen).length ?? 0;

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="text-title font-bold tracking-tight text-ink">Alerts</h1>
        <button
          type="button"
          data-testid="alerts-mark-read"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="rounded-control border border-line bg-surface px-2.5 py-1.5 text-caption font-semibold text-ink-soft disabled:opacity-40"
        >
          Mark all read
        </button>
      </div>

      {failed && items === null ? (
        <p
          data-testid="alerts-error"
          className="mt-4 rounded-control border border-clay-deep bg-clay-wash px-3 py-2.5 text-small text-clay-deep"
        >
          Couldn&apos;t load your alerts. Check your connection.
        </p>
      ) : null}

      {items !== null && items.length === 0 ? (
        <p
          data-testid="alerts-empty"
          className="mt-6 rounded-control border border-line bg-surface px-4 py-6 text-center text-small text-ink-soft"
        >
          Nothing here yet. New friends and moderation notices land on this
          tab.
        </p>
      ) : null}

      {/* Rows arrive in sequence rather than all at once. A notifications tab
          that materialises fully formed gives no sense of what just landed;
          a 40ms cascade reads as "these came in". */}
      <StaggerList role="list" testId="alerts-list" className="mt-4 space-y-1.5">
        {(items ?? []).map((n) => {
          const copy = COPY[n.type];
          const unread = !lastSeen || n.createdAt > lastSeen;
          return (
            <StaggerItem role="listitem" key={n.id}>
              <div
                data-testid={`alert-${n.type}`}
                data-unread={unread ? 'true' : 'false'}
                className={[
                  // Left rule, not a full border: the tone is carried by a
                  // 4px accent edge, which lets a stack of these read as one
                  // list instead of as a pile of separate cards.
                  'rounded-control border-l-4 bg-surface px-4 py-3.5',
                  copy.tone === 'warn' ? 'border-clay' : 'border-line',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="display text-heading text-ink">{copy.title}</p>
                  {unread ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-clay"
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-small leading-relaxed text-ink-soft">
                  {copy.body}
                </p>
                <p className="label-caps mt-2 text-ink-faint">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerList>
    </AppShell>
  );
}
