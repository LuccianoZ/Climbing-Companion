'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { SuspendedNotice } from './SuspendedNotice';

// Mounted once inside SessionProvider at the root layout. When the session
// resolves to a banned account (GET /api/auth/me answered 403
// ACCOUNT_SUSPENDED — BL-028), it replaces the entire app with the "Account
// Suspended" notice: every guarded endpoint is closed to this user, so there
// is no screen left worth rendering. Any other state (loading, anonymous,
// authenticated) passes straight through — each screen already handles those
// itself.
export function SuspendedGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === 'suspended') {
    return <SuspendedNotice />;
  }
  return <>{children}</>;
}
