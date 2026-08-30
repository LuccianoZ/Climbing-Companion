'use client';

import dynamic from 'next/dynamic';
import type { MapCanvasProps } from './MapCanvas';

// BL-019's second acceptance criterion, in one place: Leaflet touches
// `window` at import time and crashes App Router server rendering, so
// MapCanvas is loaded only in the browser. `ssr: false` is legal solely
// inside a Client Component in the App Router, which is why this wrapper
// carries 'use client' and the page that renders it does not have to.
//
// The loading state is a real skeleton rather than null: the map occupies
// the whole viewport, and a blank frame during hydration reads as a failed
// load on a slow connection at a crag.
const MapCanvas = dynamic<MapCanvasProps>(() => import('./MapCanvas'), {
  ssr: false,
  loading: () => (
    <div
      data-testid="map-loading"
      className="flex h-full w-full items-center justify-center bg-paper"
    >
      <span className="label-caps text-[11px] text-ink-faint">Loading map…</span>
    </div>
  ),
});

export function MapView(props: MapCanvasProps) {
  return <MapCanvas {...props} />;
}
