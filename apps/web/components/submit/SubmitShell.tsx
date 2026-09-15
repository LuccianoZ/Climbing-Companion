'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeftIcon } from '@/components/shell/icons';

// Deliberately not AppShell, for the same reason AuthShell is not: no bottom
// tab bar on a form you can wander away from. A half-filled route submission
// one thumb-reach from the Search tab is a submission that does not happen,
// and there is no draft persistence to come back to.
//
// router.back() rather than a fixed href: the form is reachable from the map's
// floating +, from the header menu on any tab, and from a pasted URL. Sending
// everyone to "/" would silently discard where two of those three came from.

export function SubmitShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="mx-auto flex h-full w-full max-w-[430px] flex-col border-line-soft bg-paper sm:border-x">
      <span aria-hidden className="hatch h-1 w-full shrink-0 bg-clay" />
      <header className="topo flex shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-4 py-3">
        <button
          type="button"
          aria-label="Go back"
          data-testid="submit-back"
          onClick={() => router.back()}
          className="rounded-md p-1 text-ink"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <span className="display flex-1 text-center text-heading text-ink">
          Climbing Companion
        </span>
        <span className="h-5 w-5" aria-hidden />
      </header>

      {/* `relative` is load-bearing, not decoration. A scroll container that
          is position:static is not a containing block, so an absolutely
          positioned descendant is laid out against the *initial* containing
          block (html) instead -- it neither scrolls with the content nor is
          clipped by the overflow. The photo fields' file inputs are
          `sr-only`, which is position:absolute, so all three were laid out
          against html at their static positions (y≈1678/1828/1979 on this
          form) and stretched the document to 1980px against a 1000px
          viewport. Clicking a dropzone focuses its input, and the browser
          then scrolled the *document* to reveal it -- the jump into a blank
          void under the form. Every other scroll container in the app got
          the same treatment for the same reason. */}
      <main className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <h1 className="display text-title text-ink">
          {title}
        </h1>
        <p className="mt-1 text-small leading-relaxed text-ink-soft">
          {subtitle}
        </p>
        <div className="mt-4">{children}</div>
      </main>
    </div>
  );
}
