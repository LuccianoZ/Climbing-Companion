'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as api from './api';
import type { PublicUser } from './types';

// AR-22. The frontend's only auth check: one GET /api/auth/me from a client
// component mounted at the root layout, its answer shared through context by
// the header menu, the map's action buttons, the submit FAB and every guarded
// page.
//
// Deliberately not Next middleware and not a Server Component read. The
// session cookie is HttpOnly/SameSite=Strict, so it belongs to the browser
// and a server-side check would have to forward it by hand. Decisively,
// AR-21's UI suite stubs /api/* with Playwright's page.route, which never
// sees a request the Next server makes -- guarding server-side would put the
// entire auth flow outside the test strategy this workspace has already
// committed to.
//
// Consequence, carried knowingly: AuthController sets the cookie with
// secure: true unconditionally (Foundation section 15/20.2), so it survives
// http://localhost but is silently dropped over http://<LAN-ip>:3000.
// Phone-testing anything authenticated needs HTTPS -- the Cloudflare tunnel,
// or the local certificate pair already sitting in apps/web/certificates.

export type SessionState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: PublicUser }
  | { status: 'anonymous'; user: null };

interface SessionContextValue {
  status: SessionState['status'];
  user: PublicUser | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<PublicUser>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<PublicUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: 'loading',
    user: null,
  });

  // The same check, re-runnable on demand (exposed as `refresh`). A 401 is the
  // ordinary signed-out answer, and any other failure -- the API is down, the
  // rewrite target is not running -- resolves to `anonymous` as well: there is
  // no third state a screen could usefully render, and treating an unreachable
  // API as "possibly logged in" would show actions that cannot work.
  const load = useCallback(async () => {
    try {
      const user = await api.fetchMe();
      setState({ status: 'authenticated', user });
    } catch {
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  // Written as a promise chain rather than `void load()` so the setState
  // calls sit in .then/.catch callbacks. React 19's set-state-in-effect rule
  // traces a direct call to a function that sets state and rejects it even
  // when that function is async -- the same shape MapScreen already uses for
  // its pin fetch. The `live` flag keeps a response that lands after unmount
  // from resurrecting state on a dead component.
  useEffect(() => {
    let live = true;
    api
      .fetchMe()
      .then((user) => {
        if (live) {
          setState({ status: 'authenticated', user });
        }
      })
      .catch(() => {
        if (live) {
          setState({ status: 'anonymous', user: null });
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await api.login({ email, password });
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  // AR-23. POST /api/auth/register returns the new user but sets no cookie --
  // only login does -- so registering and then asking a brand-new climber to
  // type the password they just chose a second time would be the alternative.
  // Chaining the two client-side is why /register can drop the user straight
  // onto the map.
  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      await api.register({ email, password, displayName });
      const user = await api.login({ email, password });
      setState({ status: 'authenticated', user });
      return user;
    },
    [],
  );

  // BL-003: this has to reach the server so users.refresh_token_hash is
  // actually nulled. Local state is cleared either way -- if the request
  // failed because the session was already invalid, staying "logged in" in
  // the UI would be the wrong answer to that failure.
  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      isAdmin: state.user?.role === 'SYSTEM_ADMIN',
      signIn,
      signUp,
      signOut,
      refresh: load,
    }),
    [state, signIn, signUp, signOut, load],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    // A hard throw rather than a permissive default: a component rendering
    // outside the provider would otherwise silently believe nobody is logged
    // in, which is the failure mode hardest to spot in review.
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return context;
}
