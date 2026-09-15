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
      <span aria-hidden className="hatch h-1 w-full shrink-0 bg-clay" />
      <header className="topo flex shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-4 py-2.5">
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
        {/* No wordmark here. AuthBrand renders the masthead a few pixels
            below, and printing the product name twice in one viewport is what
            made the old header read as chrome nobody had thought about. */}
        <span className="flex-1" aria-hidden />
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto px-5 py-6">
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
      {/* The inner rounded rect this glyph used to carry made the whole mark
          read as a broken-image placeholder -- a frame around a mountain is
          the universal "picture failed to load" icon. Dropping the frame and
          letting the ridgeline fill the tile leaves a summit, which is what
          it was always meant to be. */}
      <span
        aria-hidden
        className="topo flex h-[84px] w-[84px] items-center justify-center rounded-card bg-clay shadow-accent"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-paper)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-11 w-11"
        >
          <path d="M2.5 19h19L14.5 6.5l-3.2 5.6-2.4-3.1L2.5 19Z" />
          <circle cx="16.6" cy="5.4" r="1.6" fill="var(--color-paper)" stroke="none" />
        </svg>
      </span>
      {/* Stacked and hard left-to-right rather than one centred line: the
          two-tone split is the wordmark, and at display size it needs the
          room. */}
      <h1 className="mt-1 flex flex-wrap items-baseline justify-center gap-x-2">
        <span className="display text-display text-ink">CLIMBING</span>
        <span className="display text-display text-clay">/COMPANION</span>
      </h1>
      <p className="label-caps text-ink-faint">Find your route, send it.</p>
    </div>
  );
}
