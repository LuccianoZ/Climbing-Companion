'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { BellIcon, MapIcon, ProfileIcon, SearchIcon, ShieldIcon } from './icons';

// The chrome every climber-facing screen shares: a brand bar and a bottom tab
// bar.
//
// The header carries no navigation of its own. It held a hamburger menu (with
// logout and the submission links) and a profile shortcut; both duplicated
// somewhere the tab bar already goes, and a phone header with a control at
// each end leaves the product's name squeezed between them. Everything that
// menu did now lives where a user would look for it anyway: submission on the
// map's floating + (AR-29), logout on the Profile tab, and the admin
// dashboard behind the one button still up there.
//
// That button is rendered only for a SYSTEM_ADMIN. BL-012's endpoint answers
// 403 to anyone else (AR-17), so the entry point is hidden rather than
// shown-and-refused -- a control that exists only to be denied teaches
// nothing. The empty slot is reserved on both sides regardless of whether the
// button is there, so the title stays optically centred for everyone.
//
// Four tabs, not the mockup's five. Direct messaging is cut from MVP scope
// entirely -- Architecture section 7 marks `conversations` and
// `direct_messages` as "CUT, not implemented" -- so the Chat slot is gone
// rather than kept as a permanent dead placeholder.

const TABS = [
  { href: '/', label: 'Map', Icon: MapIcon },
  { href: '/search', label: 'Search', Icon: SearchIcon },
  { href: '/alerts', label: 'Alerts', Icon: BellIcon },
  { href: '/profile', label: 'Profile', Icon: ProfileIcon },
] as const;

export function AppShell({
  children,
  // The map needs the full area between the bars with no scroll of its own;
  // ordinary pages want padding and normal document flow.
  bleed = false,
}: {
  children: ReactNode;
  bleed?: boolean;
}) {
  const pathname = usePathname();
  const { isAdmin } = useSession();

  return (
    <div className="mx-auto flex h-full w-full max-w-[430px] flex-col border-line-soft bg-paper sm:border-x">
      <header className="z-[1200] flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-3">
        <span className="flex w-9 shrink-0 justify-start">
          {isAdmin ? (
            <Link
              href="/admin"
              aria-label="Admin dashboard"
              data-testid="admin-entry"
              className="rounded-[8px] border-[1.5px] border-line bg-paper p-1.5 text-clay-deep"
            >
              <ShieldIcon className="h-[18px] w-[18px]" />
            </Link>
          ) : null}
        </span>

        <span className="label-caps flex-1 text-center text-[14px] text-ink">
          Climbing Companion
        </span>

        {/* Mirrors the admin slot so the title is centred in the header, not
            in whatever space the left button happens to leave. */}
        <span className="w-9 shrink-0" aria-hidden />
      </header>

      <main
        className={
          bleed
            ? 'relative min-h-0 flex-1 overflow-hidden'
            : 'min-h-0 flex-1 overflow-y-auto px-4 py-5'
        }
      >
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="z-[1200] flex shrink-0 items-stretch justify-around border-t border-line bg-surface px-1 pt-1.5 pb-2"
      >
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              data-testid={`tab-${label.toLowerCase()}`}
              className="flex flex-1 flex-col items-center gap-1 py-1 text-ink"
            >
              <span
                className={[
                  'flex h-8 w-9 items-center justify-center rounded-lg transition-colors',
                  active ? 'bg-clay text-ink' : 'text-ink-soft',
                ].join(' ')}
              >
                <Icon className="h-[21px] w-[21px]" />
              </span>
              <span
                className={[
                  'text-[10px] leading-none',
                  active ? 'font-semibold text-ink' : 'text-ink-soft',
                ].join(' ')}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// Shared placeholder for the tabs whose stories are not built yet. Naming the
// owning epic in the UI keeps "is this broken or unbuilt?" from being a
// question anyone has to ask during a demo.
export function TabPlaceholder({
  title,
  owningStory,
  children,
}: {
  title: string;
  owningStory: string;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{children}</p>
      <p className="label-caps mt-5 inline-block rounded-full border border-line-soft bg-surface px-3 py-1.5 text-[10px] text-ink-faint">
        {owningStory}
      </p>
    </AppShell>
  );
}
