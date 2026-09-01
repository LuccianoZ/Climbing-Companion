'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { HeaderMenu } from './HeaderMenu';
import { BellIcon, MapIcon, ProfileIcon, SearchIcon } from './icons';

// The chrome every climber-facing screen in the mockups shares: a brand bar
// and a bottom tab bar. Map and Search are Epic 4's (BL-019-022); Alerts and
// Profile render honest "not built yet" placeholders naming their owning
// epic, rather than being omitted, because a tab bar that grows new items
// story by story shifts every other tab's hit target underneath the user's
// thumb each sprint.
//
// Four tabs, not the mockup's five. Direct messaging is cut from MVP scope
// entirely -- Architecture section 7 marks `conversations` and
// `direct_messages` as "CUT, not implemented" -- so the Chat slot that used
// to hold its place is gone rather than kept as a permanent dead placeholder.
// That is the one deliberate departure from the approved design here, and it
// is the honest one: the alternative is a tab that will never do anything.

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

  return (
    <div className="mx-auto flex h-full w-full max-w-[430px] flex-col border-line-soft bg-paper sm:border-x">
      <header className="z-[1200] flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-3">
        {/* BL-003 lives in here: logout is a menu item, not a page. */}
        <HeaderMenu />
        <span className="label-caps text-[15px] text-ink">Climb Companion</span>
        <Link
          href="/profile"
          aria-label="Your profile"
          className="rounded-md p-1 text-ink transition-colors hover:bg-paper"
        >
          <ProfileIcon className="h-6 w-6" />
        </Link>
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
