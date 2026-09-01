'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/session';

// The guard every authenticated page body sits behind. AR-29 notes that the
// submit FAB is hidden from signed-out visitors; this is the other half of
// that rule -- hiding an entry point is not access control, and a deep link
// or a pasted URL reaches the page regardless. Without this, a visitor could
// fill in eight fields of a route submission and be told 401 at the end.
//
// It redirects rather than rendering an inline "please log in" panel, and
// carries the current path in ?next= so signing in returns them to what they
// were trying to do instead of dumping them on the map.

export function RequireSession({
  children,
  requireAdmin = false,
  fallback,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
  fallback?: ReactNode;
}) {
  const { status, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const authenticated = status === 'authenticated';
  const permitted =
    authenticated && (!requireAdmin || user?.role === 'SYSTEM_ADMIN');

  useEffect(() => {
    if (status === 'loading') {
      return;
    }
    if (!authenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
    // A signed-in non-admin who reached an /admin URL is not sent to the login
    // screen -- they are already logged in, and bouncing them to a login form
    // they would immediately pass is a loop with no exit. They get the refusal
    // below instead.
  }, [status, authenticated, pathname, router]);

  if (status === 'loading') {
    return (
      <>
        {fallback ?? (
          <p
            data-testid="session-loading"
            className="py-10 text-center text-[11px] text-ink-faint"
          >
            Checking your session…
          </p>
        )}
      </>
    );
  }

  if (!authenticated) {
    return (
      <p
        data-testid="session-redirecting"
        className="py-10 text-center text-[11px] text-ink-faint"
      >
        Taking you to login…
      </p>
    );
  }

  if (!permitted) {
    return (
      <div
        data-testid="admin-forbidden"
        className="card space-y-2 p-5 text-center"
      >
        <h2 className="text-[15px] font-bold text-ink">Admins only</h2>
        <p className="text-[12px] leading-relaxed text-ink-soft">
          This area is for system administrators. If you think that&apos;s
          wrong, ask an admin to check your account role.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
