'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CrosshairIcon } from '@/components/shell/icons';
import { fetchMapPins, fetchPinDetail } from '@/lib/api';
import { useViewerLocation } from '@/lib/use-viewer-location';
import type { MapPin, MapSearchResult } from '@/lib/types';
import { DetailSheet, type DetailSheetState } from './DetailSheet';
import type { FlyToTarget } from './MapCanvas';
import { MapView } from './MapView';
import { SearchBar } from './SearchBar';

// Tab 1's read path: BL-019 (the map), BL-020 (pin styling, delegated to
// pin-icons.ts), BL-021 (the detail sheet) and BL-022 (search + fly-to)
// composed into the one screen the mockups show. This component owns the
// state those four stories share -- which pin is open, where the map should
// fly next, and where the viewer is -- and nothing else.
//
// It renders *inside* AppShell's <main> rather than rendering the shell
// itself: reading useSearchParams() puts this component behind a Suspense
// boundary, and if the shell were inside that boundary too the header and
// tab bar would be excluded from the server-rendered HTML along with it --
// costing a first paint of app chrome that has no reason to wait on a
// query string.

// Which entity's panel to load. Held separately from the panel's own state
// so the fetch lives in an effect keyed on the target (cancelled cleanly on
// change) while the panel's loading frame is set in the click handler that
// caused it -- rather than synchronously inside the effect, which React
// 19's react-hooks/set-state-in-effect rightly rejects.
interface DetailTarget {
  kind: 'CRAG' | 'GYM';
  id: string;
  name: string;
}

// The Search tab hands a chosen result over as query params rather than
// through a shared store: the map instance that has to fly lives on this
// route, and a URL is shareable and survives the back button. Read once at
// mount -- navigating in from /search mounts this screen fresh.
function readDeepLink(params: URLSearchParams): {
  target: DetailTarget | null;
  fly: FlyToTarget | null;
} {
  const kind = params.get('kind');
  const id = params.get('id');
  const latitude = Number(params.get('lat'));
  const longitude = Number(params.get('lng'));

  if (!kind || !id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { target: null, fly: null };
  }

  const name = params.get('name') ?? 'Selected location';
  const fly: FlyToTarget = { latitude, longitude, zoom: 16, nonce: 1 };

  if (kind === 'GYM') {
    return { target: { kind: 'GYM', id, name }, fly };
  }
  if (kind === 'CRAG') {
    return { target: { kind: 'CRAG', id, name }, fly };
  }
  // A ROUTE hit flies to the route's own coordinates but opens its parent
  // crag's panel -- the panel is per-crag, which is why the search payload
  // carries cragId alongside the route.
  const cragId = params.get('cragId');
  return {
    target: cragId ? { kind: 'CRAG', id: cragId, name } : null,
    fly,
  };
}

export function MapScreen() {
  const searchParams = useSearchParams();
  const deepLink = searchParams.toString();

  const [pins, setPins] = useState<MapPin[]>([]);
  const [pinsFailed, setPinsFailed] = useState(false);
  const [target, setTarget] = useState<DetailTarget | null>(
    () => readDeepLink(new URLSearchParams(deepLink)).target,
  );
  const [sheet, setSheet] = useState<DetailSheetState | null>(() => {
    const initial = readDeepLink(new URLSearchParams(deepLink)).target;
    return initial ? { status: 'loading', name: initial.name } : null;
  });
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(
    () => readDeepLink(new URLSearchParams(deepLink)).fly,
  );

  const viewerState = useViewerLocation();
  // Memoised so the callbacks below don't get a fresh dependency on every
  // render (and so the map's viewer marker doesn't churn on each tick).
  const viewer = useMemo(
    () =>
      viewerState.status === 'ready'
        ? { latitude: viewerState.latitude, longitude: viewerState.longitude }
        : null,
    [viewerState],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchMapPins(controller.signal)
      .then(setPins)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setPinsFailed(true);
      });
    return () => controller.abort();
  }, []);

  // One fetch per open panel. The cleanup is what prevents a slow response
  // for pin A landing after the climber has already opened pin B.
  useEffect(() => {
    if (!target) {
      return;
    }
    let live = true;
    fetchPinDetail(target.kind, target.id)
      .then((detail) => {
        if (live) {
          setSheet({ status: 'ready', detail });
        }
      })
      .catch(() => {
        if (live) {
          setSheet({ status: 'error', name: target.name });
        }
      });
    return () => {
      live = false;
    };
  }, [target]);

  const openDetail = useCallback((next: DetailTarget) => {
    setTarget(next);
    setSheet({ status: 'loading', name: next.name });
  }, []);

  // BL-021: clicking a pin opens the panel for that pin's own type.
  const handleSelectPin = useCallback(
    (pin: MapPin) => {
      setFlyTo({
        latitude: pin.latitude,
        longitude: pin.longitude,
        zoom: 15,
        nonce: Date.now(),
      });
      openDetail({ kind: pin.kind, id: pin.id, name: pin.name });
    },
    [openDetail],
  );

  // BL-022: a match flies the map to its own coordinates.
  const handleSelectSearchResult = useCallback(
    (result: MapSearchResult) => {
      setFlyTo({
        latitude: result.latitude,
        longitude: result.longitude,
        zoom: 16,
        nonce: Date.now(),
      });

      if (result.kind === 'GYM') {
        openDetail({ kind: 'GYM', id: result.id, name: result.name });
      } else if (result.kind === 'CRAG') {
        openDetail({ kind: 'CRAG', id: result.id, name: result.name });
      } else if (result.cragId) {
        openDetail({ kind: 'CRAG', id: result.cragId, name: result.name });
      }
    },
    [openDetail],
  );

  const recentreOnViewer = useCallback(() => {
    if (!viewer) {
      return;
    }
    setFlyTo({ ...viewer, zoom: 16, nonce: Date.now() });
  }, [viewer]);

  const closeSheet = useCallback(() => {
    setSheet(null);
    setTarget(null);
  }, []);

  return (
    <>
      <MapView
        pins={pins}
        selectedPinId={target?.id ?? null}
        onSelectPin={handleSelectPin}
        flyTo={flyTo}
        viewer={viewer}
      />

      {/* Leaflet's own panes sit at z-index 400-700; every overlay here is
          pushed above that range rather than fighting it locally. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3">
        <SearchBar onSelect={handleSelectSearchResult} />
        {pinsFailed ? (
          <p
            data-testid="pins-error"
            className="pointer-events-auto mt-2 rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2 text-[11.5px] text-clay-deep"
          >
            Couldn&apos;t load map pins. Check that the API is running.
          </p>
        ) : null}
        {viewerState.status === 'denied' ? (
          <p
            data-testid="location-denied"
            className="pointer-events-auto mt-2 rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2 text-[11.5px] text-ink-soft"
          >
            Location access is off, so in-range actions stay locked. Turn it
            on in your browser settings to verify, vote or log climbs.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Centre on my location"
        data-testid="recentre"
        onClick={recentreOnViewer}
        disabled={!viewer}
        className="absolute right-3 z-[1000] rounded-full border-[1.5px] border-line bg-surface p-2.5 text-ink shadow-[2px_2px_0_var(--color-line)] disabled:opacity-40"
        style={{ bottom: sheet ? 'calc(72% + 12px)' : '16px' }}
      >
        <CrosshairIcon className="h-5 w-5" />
      </button>

      {sheet ? (
        <DetailSheet state={sheet} viewer={viewer} onClose={closeSheet} />
      ) : null}
    </>
  );
}
