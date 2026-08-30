import { Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { MapScreen } from '@/components/map/MapScreen';

// Tab 1. A plain Server Component whose own module graph never reaches
// Leaflet, so App Router server rendering never sees `window` (BL-019).
//
// The shell sits outside the Suspense boundary and the map inside it:
// MapScreen reads useSearchParams() to honour deep links from the Search
// tab, which Next requires a boundary for, and keeping the header and tab
// bar out of that boundary means they are server-rendered and painted
// before the map's JavaScript has loaded.
export default function MapPage() {
  return (
    <AppShell bleed>
      <Suspense
        fallback={
          <div
            data-testid="map-booting"
            className="flex h-full w-full items-center justify-center bg-paper"
          >
            <span className="label-caps text-[11px] text-ink-faint">
              Loading map…
            </span>
          </div>
        }
      >
        <MapScreen />
      </Suspense>
    </AppShell>
  );
}
