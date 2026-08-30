'use client';

import { useEffect, useState } from 'react';

export type LocationState =
  | { status: 'locating' }
  | { status: 'ready'; latitude: number; longitude: number; accuracy: number }
  | { status: 'denied' }
  | { status: 'unavailable' };

// The browser Geolocation API is the live equivalent of the backend's
// X-Test-Mock-GPS header (Sprint1-Frontend-Scope §5). watchPosition rather
// than getCurrentPosition: BL-021's in-range buttons have to appear as a
// climber walks up to a crag, not only on the reading that happened to be
// taken when the panel opened.
//
// Playwright drives this in apps/web/features via its own geolocation
// override on the browser context, so the UI suite exercises exactly this
// code path rather than a test-only branch.
export function useViewerLocation(): LocationState {
  // Resolved in the initializer rather than in the effect below: React 19's
  // react-hooks/set-state-in-effect rule (correctly) rejects a synchronous
  // setState in an effect body, and "does this browser expose geolocation
  // at all" is a render-time fact, not a subscription. Both branches render
  // identically, so the server's `unavailable` and the client's `locating`
  // produce the same markup and hydration stays clean.
  const [state, setState] = useState<LocationState>(() =>
    typeof navigator === 'undefined' || !navigator.geolocation
      ? { status: 'unavailable' }
      : { status: 'locating' },
  );

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) =>
        setState({
          status: 'ready',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) =>
        setState(
          error.code === error.PERMISSION_DENIED
            ? { status: 'denied' }
            : { status: 'unavailable' },
        ),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return state;
}
