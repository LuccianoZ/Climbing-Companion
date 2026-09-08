'use client';

import { useState } from 'react';
import { ArrowLeftIcon } from '@/components/shell/icons';

// AR-54 (Sept 7, 2026): fixes the bug where the detail panel had no way to
// render a gallery once submission photos WERE approved -- the map read
// endpoints only ever returned `photosPending: boolean`. `photoIds` is
// ordered oldest-first by the server; each id streams from the existing
// public GET /api/media/:id gateway (unguarded for APPROVED assets, AR-15).
export function PhotoGallery({ photoIds }: { photoIds: string[] }) {
  const [index, setIndex] = useState(0);

  if (photoIds.length === 0) {
    return null;
  }

  // Clamp rather than reset-on-prop-change: if a future re-fetch ever
  // shrinks the array while this is open, this still renders a valid photo
  // instead of throwing on an out-of-range index.
  const current = Math.min(index, photoIds.length - 1);

  function show(next: number) {
    setIndex((next + photoIds.length) % photoIds.length);
  }

  return (
    <div
      data-testid="photo-gallery"
      className="relative overflow-hidden rounded-card border border-line bg-paper"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- streamed from
          our own gateway (GET /api/media/:id), which next/image can't
          optimise. */}
      <img
        key={photoIds[current]}
        src={`/api/media/${photoIds[current]}`}
        alt={`Photo ${current + 1} of ${photoIds.length}`}
        data-testid="photo-gallery-image"
        className="aspect-[4/3] w-full object-cover"
      />

      {photoIds.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            data-testid="photo-gallery-prev"
            onClick={() => show(current - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface/90 p-1.5 text-ink shadow-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            data-testid="photo-gallery-next"
            onClick={() => show(current + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface/90 p-1.5 text-ink shadow-sm"
          >
            <ArrowLeftIcon className="h-4 w-4 rotate-180" />
          </button>
          <span
            data-testid="photo-gallery-position"
            className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2 py-0.5 text-caption font-bold text-paper"
          >
            {current + 1} / {photoIds.length}
          </span>
        </>
      ) : null}
    </div>
  );
}
