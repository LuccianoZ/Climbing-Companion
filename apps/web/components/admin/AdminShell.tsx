'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ShieldIcon, SignOutIcon } from '@/components/shell/icons';
import { useSession } from '@/lib/session';

// AR-28. BL-012 is the first admin-facing screen in the app, and it is built
// as the seed of Epic 7's Admin Dashboard rather than as a standalone page,
// so Sprint 3's moderation queue, strike log and photo review drop into this
// shell instead of it being rebuilt around them.
//
// It is the first surface to take the *second* half of Foundation section
// 17's Definition of Done -- "mobile-first for climber-facing surfaces, dense
// multi-column for /admin/*" -- so it deliberately breaks every layout rule
// the climber app follows: no 430px column, no bottom tab bar, a persistent
// sidebar, and a full-width content area. An admin working a queue is at a
// desk with a mouse, not at a crag with one thumb.
//
// It does not enforce access itself; RequireSession(requireAdmin) wraps the
// page bodies. Keeping authorisation in one component rather than duplicating
// it into the chrome means there is one place to read to know who gets in.

const SECTIONS = [
  {
    href: '/admin/gyms',
    label: 'Gym verification',
    story: 'BL-012',
    available: true,
  },
  {
    href: '/admin/media',
    label: 'Photo flag queue',
    story: 'BL-027 / BL-029 — Sprint 3',
    available: false,
  },
  {
    href: '/admin/users',
    label: 'Strikes & bans',
    story: 'BL-030 / BL-031 — Sprint 3',
    available: false,
  },
] as const;

export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useSession();

  async function onSignOut() {
    await signOut();
    router.replace('/');
  }

  return (
    <div className="flex min-h-full w-full flex-col bg-paper">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b-[1.5px] border-line bg-surface px-5 py-3">
        <div className="flex items-center gap-2.5">
          <ShieldIcon className="h-5 w-5 text-clay-deep" />
          <span className="label-caps text-[13px] text-ink">
            Climbing Companion — Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            data-testid="admin-back-to-app"
            className="text-[11.5px] text-ink-soft underline decoration-line-soft underline-offset-4"
          >
            Back to the map
          </Link>
          {user ? (
            <span
              data-testid="admin-identity"
              className="text-[11.5px] text-ink-faint"
            >
              {user.displayName}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="admin-logout"
            onClick={onSignOut}
            className="flex items-center gap-1.5 rounded-[8px] border border-line-soft px-2.5 py-1.5 text-[11.5px] text-ink-soft"
          >
            <SignOutIcon className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Admin sections"
          data-testid="admin-sidebar"
          className="shrink-0 border-b border-line-soft bg-surface p-3 md:w-60 md:border-b-0 md:border-r"
        >
          <ul className="flex gap-2 md:flex-col">
            {SECTIONS.map((section) => {
              const active = pathname.startsWith(section.href);
              return (
                <li key={section.href} className="flex-1">
                  {section.available ? (
                    <Link
                      href={section.href}
                      data-testid={`admin-nav-${section.label.toLowerCase().replace(/\s+/g, '-')}`}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'block rounded-[8px] px-3 py-2 text-[12.5px]',
                        active
                          ? 'bg-ink font-semibold text-paper'
                          : 'text-ink hover:bg-paper',
                      ].join(' ')}
                    >
                      {section.label}
                    </Link>
                  ) : (
                    // Named, not omitted: the same convention AppShell's
                    // TabPlaceholder uses. An admin should be able to see that
                    // the queue exists and is scheduled, rather than wonder
                    // whether this build is missing it.
                    <span
                      className="block cursor-not-allowed rounded-[8px] px-3 py-2 text-[12.5px] text-ink-faint"
                      title={section.story}
                    >
                      {section.label}
                      <span className="block text-[9.5px]">{section.story}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-soft">
            {description}
          </p>
          <div className="mt-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
