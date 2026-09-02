'use client';

import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import type { MapSearchResult } from '@/lib/types';
import { SearchBar } from './SearchBar';

// Tab 2's read path (BL-022). The same DB-only search the map overlay uses,
// given a full-screen home for climbers who reach for the tab instead of
// the overlay. Selecting a result hands off to the map, which is what
// actually flies -- the fly-to lives with the map instance, not here.
export function SearchScreen() {
  const router = useRouter();

  const handleSelect = (result: MapSearchResult) => {
    const params = new URLSearchParams({
      kind: result.kind,
      id: result.id,
      name: result.name,
      lat: String(result.latitude),
      lng: String(result.longitude),
    });
    if (result.cragId) {
      params.set('cragId', result.cragId);
    }
    router.push(`/?${params.toString()}`);
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-bold tracking-tight text-ink">Search</h1>
      <p className="mt-1 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
        Find a route, crag or gym by name and jump straight to it on the map.
        Results come from Climbing Companion&apos;s own database.
      </p>
      <SearchBar onSelect={handleSelect} autoFocus />
    </AppShell>
  );
}
