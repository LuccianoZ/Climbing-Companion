'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PlusIcon } from '@/components/shell/icons';
import { useSession } from '@/lib/session';

// AR-29. Adding a route is the app's primary contribution action, and the
// moment someone wants it is standing at an unlisted crag with a phone in one
// hand -- so it lives bottom-right of the map, where the thumb already is,
// rather than three taps into a menu.
//
// It is hidden entirely when signed out. That is a deliberate departure from
// AR-25's rule for the in-range action buttons, which *are* shown to visitors
// and route them to /login: those sit inside a panel a visitor opened on
// purpose, and are the reason to sign up. This is permanent chrome on the
// front door, and a button that only ever leads to a login wall reads as
// nagging rather than inviting.
//
// Two destinations behind one +, because a gym and a route are different
// forms; the map cannot know which you meant.

export function SubmitFab({ raised }: { raised: boolean }) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <div
      ref={containerRef}
      data-testid="submit-fab"
      className="absolute right-3 z-[1000] flex flex-col items-end gap-2"
      // Lifts clear of the detail sheet when one is open, the same way the
      // recentre button does, so the two never stack on top of each other.
      style={{ bottom: raised ? 'calc(64% + 64px)' : '68px' }}
    >
      {open ? (
        <div className="flex flex-col gap-2">
          <FabLink
            href="/submit-route"
            label="New route"
            testId="fab-submit-route"
            onNavigate={() => setOpen(false)}
          />
          <FabLink
            href="/submit-gym"
            label="New gym"
            testId="fab-submit-gym"
            onNavigate={() => setOpen(false)}
          />
        </div>
      ) : null}

      <button
        type="button"
        aria-label="Add a route or gym"
        aria-expanded={open}
        data-testid="submit-fab-button"
        onClick={() => setOpen((current) => !current)}
        className="press rounded-control bg-clay p-4 text-paper shadow-accent"
      >
        <PlusIcon
          className={[
            'h-6 w-6 transition-transform duration-(--dur-base) ease-spring',
            open ? 'rotate-[135deg]' : '',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

function FabLink({
  href,
  label,
  testId,
  onNavigate,
}: {
  href: string;
  label: string;
  testId: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      onClick={onNavigate}
      className="glass press display rounded-control px-4 py-3 text-heading leading-none text-ink shadow-overlay"
    >
      {label}
    </Link>
  );
}
