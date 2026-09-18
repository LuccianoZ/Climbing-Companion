'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { ScreenTransition } from '@/components/ui/motion';
import { BellIcon, MapIcon, ProfileIcon, ShieldIcon } from './icons';

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
// Three tabs, not the mockup's five. Direct messaging is cut from MVP scope
// entirely -- Architecture section 7 marks `conversations` and
// `direct_messages` as "CUT, not implemented" -- so the Chat slot is gone
// rather than kept as a permanent dead placeholder. Search is gone too: the
// map screen already carries its own search bar up top (SearchBar, reused
// by /search), so a bottom-tab twin of it was a second way to do the exact
// same lookup rather than a distinct destination.
//
// The last tab is the account slot: "Profile" for a signed-in climber,
// "Log in" for a visitor (Owner request, Sept 3). Same position and icon --
// a visitor tapping where the profile lives is trying to get to their
// account, and the honest next step for them is the login screen.

const BASE_TABS = [
  { href: '/', label: 'Map', Icon: MapIcon },
  { href: '/alerts', label: 'Alerts', Icon: BellIcon },
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
  const { isAdmin, status } = useSession();

  const accountTab =
    status === 'authenticated'
      ? { href: '/profile', label: 'Profile', Icon: ProfileIcon }
      : { href: '/login', label: 'Log in', Icon: ProfileIcon };
  const tabs = [...BASE_TABS, accountTab];

  return (
    <div className="mx-auto flex h-full w-full max-w-[430px] flex-col border-line-soft bg-paper sm:border-x">
      {/* The hazard strip. Four pixels of accent across the top of every
          screen -- the athletic-signage motif, and the cheapest possible way
          to make the whole app read as one branded object rather than as a
          dark background. */}
      <span
        aria-hidden
        className="hatch h-1 w-full shrink-0 bg-clay animate-wipe"
      />

      {/* Topographic contour texture: what makes the chrome belong to a
          climbing product rather than a generic dark app. */}
      <header className="topo z-[1200] flex shrink-0 select-none items-center gap-2 border-b border-line-soft bg-surface px-4 py-3">
        <span className="flex w-9 shrink-0 justify-start">
          {isAdmin ? (
            <Link
              href="/admin"
              aria-label="Admin dashboard"
              data-testid="admin-entry"
              className="press rounded-control bg-clay p-2 text-paper"
            >
              <ShieldIcon className="h-[18px] w-[18px]" />
            </Link>
          ) : null}
        </span>

        {/* Left-aligned, not centred. A centred wordmark between two reserved
            slots is a caption; hard against the edge at display size it is a
            masthead. The slash is the condensed-signage tic that keeps it from
            reading as plain uppercase text. */}
        <span className="flex flex-1 items-baseline gap-1.5">
          <span className="display text-title leading-none text-ink">
            CLIMBING
          </span>
          <span className="display text-title leading-none text-clay">
            /COMPANION
          </span>
        </span>

        <span className="w-9 shrink-0" aria-hidden />
      </header>

      <main
        className={
          bleed
            ? 'relative min-h-0 flex-1 overflow-hidden'
            : 'topo relative min-h-0 flex-1 overflow-y-auto px-4 py-6'
        }
      >
        {/* The map is exempt: it owns its own viewport, holds a Leaflet
            instance and a geolocation watch, and translating it on every tab
            return would re-trigger a resize measurement for no gain. Ordinary
            pages get the transition. */}
        {bleed ? children : (
          <ScreenTransition routeKey={pathname}>{children}</ScreenTransition>
        )}
      </main>

      <nav
        aria-label="Primary"
        className="glass z-[1200] flex shrink-0 select-none items-stretch justify-around border-x-0 border-b-0 px-2 pt-2 pb-3"
      >
        {tabs.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              data-testid={`tab-${label.toLowerCase().replace(/\s+/g, '-')}`}
              // 44px minimum touch target (plugin priority 2). The old tab was
              // a 32px chip over a 10px label and missed it on both axes.
              className={[
                'press relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1.5 py-1.5',
                'rounded-control transition-colors duration-(--dur-fast) ease-standard',
                // Accent as a FIELD: the current tab is a solid block of chalk
                // orange with dark content on it, not an outlined icon with a
                // tinted wash behind it. This is the single clearest place the
                // register shows up, because it is on screen constantly.
                active ? 'field-accent' : 'text-ink-faint',
              ].join(' ')}
            >
              <Icon className="h-[21px] w-[21px]" />
              <span
                className={[
                  'label-caps leading-none',
                  active ? 'text-paper' : 'text-ink-faint',
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
      <h1 className="text-title font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-body leading-relaxed text-ink-soft">{children}</p>
      <p className="label-caps mt-5 inline-block rounded-full border border-line-soft bg-surface px-3 py-1.5 text-caption text-ink-faint">
        {owningStory}
      </p>
    </AppShell>
  );
}
