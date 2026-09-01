'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { CrosshairIcon } from '@/components/shell/icons';
import type { LocationPickerCanvasProps } from './LocationPickerCanvas';

// AR-27's coordinate entry, all three ways in at once, because each covers a
// case the others cannot:
//
//   * Tap or drag the pin -- the primary path, and the one the mockup draws.
//   * "Use my location" -- one tap when you are standing at the route, which
//     is the common case for a first-hand submission.
//   * Type the numbers -- the escape hatch. A guidebook lists coordinates; a
//     phone's GPS is off by 40m under a headwall; a desktop has no useful fix
//     at all. Making the map the *only* input would make those unsubmittable.
//
// The pin is deliberately not locked to the device's own position. Locking it
// would guarantee every submission was made on site, which is better data --
// but it also makes it impossible to add a route you photographed yesterday,
// and impossible to test any of this from a desk. BL-006 is explicitly not
// presence-gated (unlike verification, voting and logging, which are), so the
// server does not ask for that guarantee either.

const LocationPickerCanvas = dynamic<LocationPickerCanvasProps>(
  () => import('./LocationPickerCanvas'),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="picker-loading"
        className="flex h-full w-full items-center justify-center bg-paper"
      >
        <span className="label-caps text-[10px] text-ink-faint">
          Loading map…
        </span>
      </div>
    ),
  },
);

export interface LatLng {
  latitude: number;
  longitude: number;
}

export function LocationPicker({
  point,
  onPick,
  onUseMyLocation,
  locationAvailable,
  placed,
  error,
}: {
  point: LatLng;
  onPick: (next: LatLng) => void;
  onUseMyLocation: () => void;
  locationAvailable: boolean;
  // False until the climber has either tapped the map or taken a GPS fix, so
  // the form can refuse to submit the fallback centre as if it were a choice.
  placed: boolean;
  error?: string | null;
}) {
  // Bumped only when the point changes from somewhere *other* than the number
  // fields, and used as their React key so they re-read the new value. The
  // alternative -- syncing text state from a prop inside an effect -- is the
  // pattern React 19's set-state-in-effect rule rejects, and the same
  // constraint AR-27 and AR-32 already worked around elsewhere.
  const [syncKey, setSyncKey] = useState(0);

  function pickFromMap(next: LatLng) {
    setSyncKey((current) => current + 1);
    onPick(next);
  }

  function useMyLocation() {
    setSyncKey((current) => current + 1);
    onUseMyLocation();
  }

  return (
    <div className="space-y-1.5">
      <span className="label-caps block text-[9.5px] text-ink-faint">
        Location coordinates *
      </span>

      <div
        data-testid="location-picker"
        data-placed={placed ? 'true' : 'false'}
        className={[
          'overflow-hidden rounded-[12px] border-[1.5px]',
          error ? 'border-clay-deep' : 'border-line',
        ].join(' ')}
      >
        <div className="relative h-52 w-full">
          <LocationPickerCanvas
            latitude={point.latitude}
            longitude={point.longitude}
            onPick={pickFromMap}
          />

          <button
            type="button"
            onClick={useMyLocation}
            disabled={!locationAvailable}
            aria-label="Use my current location"
            data-testid="use-my-location"
            className="absolute bottom-2.5 right-2.5 z-[500] rounded-full border-[1.5px] border-line bg-surface p-2 text-ink shadow-[2px_2px_0_var(--color-line)] disabled:opacity-40"
          >
            <CrosshairIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t-[1.5px] border-line bg-paper p-2.5">
          <CoordinateField
            key={`lat-${syncKey}`}
            label="Latitude"
            name="latitude"
            value={point.latitude}
            min={-90}
            max={90}
            onCommit={(latitude) => onPick({ ...point, latitude })}
          />
          <CoordinateField
            key={`lng-${syncKey}`}
            label="Longitude"
            name="longitude"
            value={point.longitude}
            min={-180}
            max={180}
            onCommit={(longitude) => onPick({ ...point, longitude })}
          />
        </div>
      </div>

      <p className="text-[10.5px] leading-snug text-ink-faint">
        {placed
          ? 'Tap the map, drag the pin, or edit the numbers to adjust.'
          : locationAvailable
            ? 'Tap the map to place the pin, or use the crosshair for your current location.'
            : 'Location access is off — tap the map to place the pin, or type the coordinates.'}
      </p>

      {error ? (
        <p
          data-testid="field-error-location"
          className="text-[10.5px] leading-snug text-clay-deep"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

// Text rather than <input type="number">: a number input on iOS Safari
// silently drops a trailing "." and a lone "-", which makes typing a negative
// western longitude one digit at a time genuinely impossible. Parsing by hand
// and only committing a finite, in-range value keeps every intermediate
// keystroke typeable.
function CoordinateField({
  label,
  name,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(() => value.toFixed(5));

  function onChange(next: string) {
    setText(next);
    const parsed = Number(next);
    if (next.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      onCommit(parsed);
    }
  }

  return (
    <label className="block">
      <span className="label-caps block text-[8.5px] text-ink-faint">
        {label}
      </span>
      <input
        name={name}
        inputMode="decimal"
        value={text}
        data-testid={`coordinate-${name}`}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent py-1 text-[12px] font-semibold text-ink outline-none"
      />
    </label>
  );
}
