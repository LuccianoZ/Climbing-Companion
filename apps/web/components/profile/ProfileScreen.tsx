'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { SignOutIcon } from '@/components/shell/icons';
import { useSession } from '@/lib/session';

// The Profile tab, which is now also where BL-003 lives. Logging out used to
// be a header menu item; with the header cleared of controls it moves here,
// which is where someone looks for it anyway.
//
// Signed out, this tab is a sign-in prompt rather than a locked screen: the
// tab bar is always visible, so tapping Profile while signed out is the most
// natural way into the auth flow, and ?next= brings them back afterwards.
//
// Everything below the account block -- logbook, favourite routes, privacy --
// is Epic 5 and named as such rather than mocked up, so nobody mistakes an
// unbuilt screen for a broken one.

export function ProfileScreen() {
  const { status, user, signOut } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login?next=%2Fprofile');
    }
  }, [status, router]);

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace('/');
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
      {/* Top-left, ahead of the account details: it is the only action on this
          screen, so burying it under a stack of "not built yet" notices would
          be hiding the one thing that works. */}
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

      <p className="mt-5 text-sm leading-relaxed text-ink-soft">
        Your logbook, favourite routes, grade progress and privacy controls
        land here once their epic is scheduled.
      </p>
      <p className="label-caps mt-3 inline-block rounded-full border border-line-soft bg-surface px-3 py-1.5 text-[10px] text-ink-faint">
        Epic 5 — Profiles &amp; Logbook
      </p>
    </AppShell>
  );
}
