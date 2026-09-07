'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { SignOutIcon } from '@/components/shell/icons';
import { BadgesPublicToggle } from '@/components/profile/BadgesPublicToggle';
import { GymBadgeShelf } from '@/components/profile/GymBadgeShelf';
import { GymStreaksList } from '@/components/profile/GymStreaksList';
import { OutdoorAnalyticsCharts } from '@/components/profile/OutdoorAnalyticsCharts';
import { PendingFriendRequests } from '@/components/profile/PendingFriendRequests';
import * as api from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { useSession } from '@/lib/session';
import type {
  GymActivity,
  OutdoorAnalytics,
  PendingFriendRequest,
} from '@/lib/types';

// The Profile tab, which is also where BL-003 (logout) lives. Logging out
// used to be a header menu item; with the header cleared of controls it
// moves here, which is where someone looks for it anyway.
//
// Signed out, this tab is a sign-in prompt rather than a locked screen: the
// tab bar is always visible, so tapping Profile while signed out is the most
// natural way into the auth flow, and ?next= brings them back afterwards.
//
// Epic 8 (Sept 7, 2026, AR-53) fills in what was previously a placeholder:
// outdoor analytics (BL-036/037), the Gym Badge shelf and Gym Streaks
// (BL-x09/x10), the badges-public toggle, and Pending Friend Requests
// (BL-x11). There is deliberately no "send a friend request" UI here yet --
// see PendingFriendRequests's own comment for why.

export function ProfileScreen() {
  const { status, user, signOut } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const [activity, setActivity] = useState<GymActivity | null>(null);
  const [analytics, setAnalytics] = useState<OutdoorAnalytics | null>(null);
  const [pendingRequests, setPendingRequests] = useState<
    PendingFriendRequest[] | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [togglingBadgesPublic, setTogglingBadgesPublic] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login?next=%2Fprofile');
    }
  }, [status, router]);

  const loadProfileData = useCallback(
    (userId: string) => {
      let live = true;

      Promise.all([
        api.fetchGymActivity(userId),
        api.fetchOutdoorAnalytics(userId),
        api.fetchPendingFriendRequests(),
      ])
        .then(([activityRes, analyticsRes, pendingRes]) => {
          if (!live) return;
          setActivity(activityRes);
          setAnalytics(analyticsRes);
          setPendingRequests(pendingRes);
          setLoadError(null);
        })
        .catch((error: unknown) => {
          if (!live) return;
          setLoadError(messageFor('GYM_ACTIVITY', error));
        });

      return () => {
        live = false;
      };
    },
    [],
  );

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      return;
    }
    return loadProfileData(user.id);
  }, [status, user, loadProfileData]);

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace('/');
  }

  async function onToggleBadgesPublic(next: boolean) {
    setTogglingBadgesPublic(true);
    setActionError(null);
    try {
      await api.updateBadgesPublic(next);
      setActivity((current) =>
        current ? { ...current, badgesPublic: next } : current,
      );
    } catch (error) {
      setActionError(messageFor('BADGES_PUBLIC', error));
    } finally {
      setTogglingBadgesPublic(false);
    }
  }

  async function onAcceptRequest(id: string) {
    setActionError(null);
    try {
      await api.acceptFriendRequest(id);
      setPendingRequests((current) =>
        (current ?? []).filter((r) => r.id !== id),
      );
      // Accepting can newly unlock streak visibility with this friend, but
      // this viewer's own activity doesn't change -- no re-fetch needed.
    } catch (error) {
      setActionError(messageFor('FRIEND_REQUEST', error));
    }
  }

  async function onDeclineRequest(id: string) {
    setActionError(null);
    try {
      await api.removeFriendship(id);
      setPendingRequests((current) =>
        (current ?? []).filter((r) => r.id !== id),
      );
    } catch (error) {
      setActionError(messageFor('FRIEND_REQUEST', error));
    }
  }

  if (status !== 'authenticated' || !user) {
    return (
      <AppShell>
        <p
          data-testid={status === 'loading' ? 'session-loading' : 'session-redirecting'}
          className="py-10 text-center text-[11px] text-ink-faint"
        >
          {status === 'loading' ? 'Checking your session…' : 'Taking you to login…'}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Top-left, ahead of the account details: it is the one control every
          visitor to this screen can always use. */}
      <button
        type="button"
        data-testid="profile-logout"
        onClick={onSignOut}
        disabled={signingOut}
        className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2 text-[12px] font-bold text-clay-deep disabled:opacity-45"
      >
        <SignOutIcon className="h-4 w-4" />
        {signingOut ? 'Logging out…' : 'Log out'}
      </button>

      <div data-testid="profile-account" className="card mt-4 p-4">
        <p className="label-caps text-[9px] text-ink-faint">Signed in as</p>
        <p className="mt-1 text-[17px] font-bold tracking-tight text-ink">
          {user.displayName}
        </p>
        <p className="text-[12px] text-ink-soft">{user.email}</p>
        {user.role === 'SYSTEM_ADMIN' ? (
          <p className="label-caps mt-3 inline-block rounded-full border border-line-soft bg-paper px-2.5 py-1 text-[9px] text-clay-deep">
            System admin
          </p>
        ) : null}
      </div>

      {loadError ? (
        <p
          data-testid="profile-load-error"
          className="mt-4 rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
        >
          {loadError}
        </p>
      ) : null}

      {actionError ? (
        <p
          data-testid="profile-action-error"
          className="mt-4 rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
        >
          {actionError}
        </p>
      ) : null}

      <section className="card mt-4 p-4">
        <div className="flex items-center justify-between">
          <p className="label-caps text-[9px] text-ink-faint">Gym Badges</p>
        </div>
        {activity ? (
          <>
            <div className="mt-3">
              <GymBadgeShelf badges={activity.badges} />
            </div>
            <div className="mt-4 border-t border-line-soft pt-3">
              <BadgesPublicToggle
                badgesPublic={activity.badgesPublic}
                onChange={onToggleBadgesPublic}
                disabled={togglingBadgesPublic}
              />
            </div>
          </>
        ) : (
          <p className="mt-3 text-[12px] text-ink-faint">Loading…</p>
        )}
      </section>

      <section className="card mt-4 p-4">
        <p className="label-caps text-[9px] text-ink-faint">Gym Streaks</p>
        <div className="mt-3">
          {activity ? (
            <GymStreaksList streaks={activity.streaks} />
          ) : (
            <p className="text-[12px] text-ink-faint">Loading…</p>
          )}
        </div>
      </section>

      <section className="card mt-4 p-4">
        <p className="label-caps text-[9px] text-ink-faint">
          Pending Friend Requests
        </p>
        <div className="mt-3">
          {pendingRequests ? (
            <PendingFriendRequests
              requests={pendingRequests}
              onAccept={onAcceptRequest}
              onDecline={onDeclineRequest}
            />
          ) : (
            <p className="text-[12px] text-ink-faint">Loading…</p>
          )}
        </div>
      </section>

      <div className="mt-4">
        {analytics ? (
          <OutdoorAnalyticsCharts analytics={analytics} />
        ) : (
          <p className="text-[12px] text-ink-faint">Loading analytics…</p>
        )}
      </div>
    </AppShell>
  );
}
