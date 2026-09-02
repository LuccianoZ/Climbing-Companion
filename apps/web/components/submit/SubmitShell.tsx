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
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <button
          type="button"
          aria-label="Go back"
          data-testid="submit-back"
          onClick={() => router.back()}
          className="rounded-md p-1 text-ink"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <span className="label-caps flex-1 text-center text-[15px] text-ink">
          Climbing Companion
        </span>
        <span className="h-5 w-5" aria-hidden />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <h1 className="text-[21px] font-bold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
          {subtitle}
        </p>
        <div className="mt-4">{children}</div>
      </main>
    </div>
  );
}
