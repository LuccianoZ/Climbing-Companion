'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { CrosshairIcon } from '@/components/shell/icons';
import { clampToRadius } from '@/lib/geo';
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
        <span className="label-caps text-caption text-ink-faint">
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

export interface RadiusConstraint {
  centre: LatLng;
  radiusMeters: number;
}

export function LocationPicker({
  point,
  onPick,
  onUseMyLocation,
  locationAvailable,
  placed,
  error,
  constrainTo = null,
}: {
  point: LatLng;
  onPick: (next: LatLng) => void;
  onUseMyLocation: () => void;
  locationAvailable: boolean;
  // False until the climber has either tapped the map or taken a GPS fix, so
  // the form can refuse to submit the fallback centre as if it were a choice.
  placed: boolean;
  error?: string | null;
  // AR-51 BL-x02: for a non-admin submission, the pin can only be placed
  // inside a circle around the submitter's device location -- a tap or drag
  // outside it snaps to the boundary. Null for an admin (no constraint) or
  // when the device location is not yet known.
  constrainTo?: RadiusConstraint | null;
}) {
  function constrain(next: LatLng): LatLng {
    if (!constrainTo) return next;
    return clampToRadius(constrainTo.centre, next, constrainTo.radiusMeters);
  }

  function pickFromMap(next: LatLng) {
    onPick(constrain(next));
  }

  return (
    <div className="space-y-1.5">
      <span className="label-caps block text-caption text-ink-faint">
        Location coordinates *
      </span>

      <div
        data-testid="location-picker"
        data-placed={placed ? 'true' : 'false'}
        className={[
          'overflow-hidden rounded-card border',
          error ? 'border-clay-deep' : 'border-line',
        ].join(' ')}
      >
        <div className="relative h-52 w-full">
          <LocationPickerCanvas
            latitude={point.latitude}
            longitude={point.longitude}
            onPick={pickFromMap}
            constrainTo={constrainTo}
            placed={placed}
          />

          <button
            type="button"
            onClick={onUseMyLocation}
            disabled={!locationAvailable}
            aria-label="Use my current location"
            data-testid="use-my-location"
            className="absolute bottom-2.5 right-2.5 z-[500] rounded-full border border-line bg-surface p-2 text-ink shadow-raised disabled:opacity-40"
          >
            <CrosshairIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t-[1.5px] border-line bg-paper p-2.5">
          <CoordinateField
            label="Latitude"
            name="latitude"
            value={point.latitude}
            min={-90}
            max={90}
            onCommit={(latitude) => onPick(constrain({ ...point, latitude }))}
          />
          <CoordinateField
            label="Longitude"
            name="longitude"
            value={point.longitude}
            min={-180}
            max={180}
            onCommit={(longitude) => onPick(constrain({ ...point, longitude }))}
          />
        </div>
      </div>

      <p
        data-testid="location-picker-hint"
        className="text-caption leading-snug text-ink-faint"
      >
        {constrainTo
          ? `The pin has to be within ${constrainTo.radiusMeters}m of where you are — the circle shows how far you can move it. Drag past the edge and it snaps back.`
          : placed
            ? 'Tap the map, drag the pin, or edit the numbers to adjust.'
            : locationAvailable
              ? 'Tap the map to place the pin, or use the crosshair for your current location.'
              : 'Location access is off — tap the map to place the pin, or type the coordinates.'}
      </p>

      {error ? (
        <p
          data-testid="field-error-location"
          className="text-caption leading-snug text-clay-deep"
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
  // `draft` is non-null only while this field is being edited. Off-draft the
  // input renders straight from the prop, so a point that changes from
  // anywhere else -- the first GPS fix, the crosshair, a tap on the map, a
  // clamp to the 300m circle -- is reflected immediately.
  //
  // This replaces a remount-on-a-key-counter scheme that only bumped for the
  // map and the crosshair. The first GPS fix bumped nothing, so the fields
  // kept their mount-time text: the map flew to your location while the
  // numbers under it still read the Yosemite fallback, and those numbers are
  // what the form submits. Deriving from the prop instead of copying it
  // means there is no second source of truth left to drift.
  //
  // A draft still has to exist, because the value is parsed per keystroke and
  // "-", "42." and "" are all unparseable states you must pass through to
  // type a negative western longitude one digit at a time.
  const [draft, setDraft] = useState<string | null>(null);

  function onChange(next: string) {
    setDraft(next);
    const parsed = Number(next);
    if (next.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      onCommit(parsed);
    }
  }

  return (
    <label className="block">
      <span className="label-caps block text-caption text-ink-faint">
        {label}
      </span>
      <input
        name={name}
        inputMode="decimal"
        value={draft ?? value.toFixed(5)}
        data-testid={`coordinate-${name}`}
        onChange={(event) => onChange(event.target.value)}
        // Dropping the draft on blur snaps the field back to the canonical
        // value -- which matters when a clamp moved the pin to the circle's
        // edge, or when what was typed never parsed at all.
        onBlur={() => setDraft(null)}
        className="w-full bg-transparent py-1 text-small font-semibold text-ink outline-none"
      />
    </label>
  );
}
