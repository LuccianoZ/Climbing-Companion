'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { MenuIcon, PlusIcon, ShieldIcon, SignOutIcon } from './icons';

// The hamburger in AppShell's header was a dead button through Epic 4. It is
// now where BL-003 lives: logout is a menu item, not a page, per
// Sprint1-Frontend-Scope section 1.
//
// It is also the only always-reachable route to the admin dashboard. BL-012's
// endpoint answers 403 to a non-admin (AR-17), so the entry point is hidden
// rather than shown-and-failed -- a menu item that exists only to be refused
// teaches nothing.

export function HeaderMenu() {
  const { status, user, isAdmin, signOut } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Registered on the document because
  // the map underneath swallows pointer events of its own, so relying on a
  // blur from inside the panel is not enough.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function onSignOut() {
    setOpen(false);
    await signOut();
    router.replace('/');
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        data-testid="header-menu-button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-md p-1 text-ink transition-colors hover:bg-paper"
      >
        <MenuIcon className="h-6 w-6" />
      </button>

      {open ? (
        <div
          role="menu"
          data-testid="header-menu"
          className="absolute left-0 top-[calc(100%+10px)] z-[1300] w-60 overflow-hidden rounded-[12px] border-[1.5px] border-line bg-surface shadow-[3px_3px_0_var(--color-line)]"
        >
          {status === 'authenticated' && user ? (
            <>
              <div className="border-b border-line-soft px-3.5 py-3">
                <p
                  data-testid="menu-display-name"
                  className="truncate text-[13px] font-bold text-ink"
                >
                  {user.displayName}
                </p>
                <p className="truncate text-[10.5px] text-ink-faint">
                  {user.email}
                </p>
              </div>

              <MenuLink
                href="/submit-route"
                testId="menu-submit-route"
                icon={<PlusIcon className="h-4 w-4" />}
                label="Submit a route"
                onNavigate={() => setOpen(false)}
              />
              <MenuLink
                href="/submit-gym"
                testId="menu-submit-gym"
                icon={<PlusIcon className="h-4 w-4" />}
                label="Submit a gym"
                onNavigate={() => setOpen(false)}
              />

              {isAdmin ? (
                <MenuLink
                  href="/admin"
                  testId="menu-admin"
                  icon={<ShieldIcon className="h-4 w-4" />}
                  label="Admin dashboard"
                  onNavigate={() => setOpen(false)}
                />
              ) : null}

              <button
                type="button"
                role="menuitem"
                data-testid="menu-logout"
                onClick={onSignOut}
                className="flex w-full items-center gap-2.5 border-t border-line-soft px-3.5 py-3 text-left text-[12.5px] text-clay-deep"
              >
                <SignOutIcon className="h-4 w-4" />
                Log out
              </button>
            </>
          ) : (
            <>
              <div className="border-b border-line-soft px-3.5 py-3">
                <p className="text-[12px] leading-snug text-ink-soft">
                  Log in to verify routes, vote on grades and log your climbs.
                </p>
              </div>
              <MenuLink
                href="/login"
                testId="menu-login"
                label="Log in"
                onNavigate={() => setOpen(false)}
              />
              <MenuLink
                href="/register"
                testId="menu-register"
                label="Create an account"
                onNavigate={() => setOpen(false)}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  label,
  testId,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  testId: string;
  icon?: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      data-testid={testId}
      onClick={onNavigate}
      className="flex items-center gap-2.5 px-3.5 py-3 text-[12.5px] text-ink"
    >
      {icon ? <span className="text-ink-faint">{icon}</span> : null}
      {label}
    </Link>
  );
}
