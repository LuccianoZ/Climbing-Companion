import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeftIcon } from '@/components/shell/icons';

// Deliberately not AppShell. The auth screens have no bottom tab bar, for the
// same reason the submission forms do not: a tab bar invites you to wander
// off mid-task, and a half-typed registration is exactly the thing that
// should not be one thumb-reach from being abandoned. The mockup draws it
// this way too -- the auth gateway has no bar at all, and the password-reset
// screen has a back arrow where the menu button normally sits.

export function AuthShell({
  children,
  backHref,
  backLabel = 'Back',
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[430px] flex-col border-line-soft bg-paper sm:border-x">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel}
            data-testid="auth-back"
            className="rounded-md p-1 text-ink"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        ) : (
          <span className="h-5 w-5" aria-hidden />
        )}
        <span className="label-caps flex-1 text-center text-[15px] text-ink">
          Climb Companion
        </span>
        <span className="h-5 w-5" aria-hidden />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        {children}
      </main>
    </div>
  );
}

// The logo lockup at the top of the gateway. The glyph is the same
// ClimbingHolds mark already sitting in public/, drawn inline as a simple
// mountain so the card renders before any asset request resolves.
export function AuthBrand() {
  return (
    <div className="flex flex-col items-center gap-2.5 pb-6 pt-2">
      <span
        aria-hidden
        className="flex h-[68px] w-[68px] items-center justify-center rounded-[18px] border-[1.5px] border-line bg-moss"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-9 w-9"
        >
          <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
          <path d="m5.5 17 4.5-6 3 3.6 2.2-2.9L18.5 17h-13Z" />
          <circle cx="9" cy="8" r="1.15" />
        </svg>
      </span>
      <h1 className="label-caps text-[19px] text-ink">Climb Companion</h1>
      <p className="text-[12px] text-ink-soft">Find your route, send it.</p>
    </div>
  );
}
