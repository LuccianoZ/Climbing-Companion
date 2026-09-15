'use client';

import { useEffect } from 'react';
import {
  AttributionControl,
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { clampToRadius } from '@/lib/geo';

// AR-27. A *separate* Leaflet canvas from components/map/MapCanvas.tsx, behind
// its own ssr:false boundary, rather than a second mode bolted onto that one.
//
// The reason is test coverage, not aesthetics: every prop MapCanvas takes is
// exercised by BL-019-022's fourteen green scenarios, and a picker needs the
// opposite behaviours in almost every respect -- one draggable marker instead
// of a pin set, click-to-place instead of click-to-select, no fly-to
// controller, no viewer dot competing with the pin being placed. Overloading
// MapCanvas would mean rewriting the component those scenarios pin down, to
// add a mode they do not cover.
//
// Same "never evaluated on the server" guarantee as MapCanvas: this module
// imports leaflet, which touches `window` at import time, and is imported
// only through LocationPicker.tsx's next/dynamic.

export interface LatLngLiteral {
  latitude: number;
  longitude: number;
}

export interface RadiusConstraint {
  centre: LatLngLiteral;
  radiusMeters: number;
}

export interface LocationPickerCanvasProps {
  latitude: number;
  longitude: number;
  onPick: (next: LatLngLiteral) => void;
  // AR-51 BL-x02: draw the 300m circle and refuse a pin outside it.
  constrainTo?: RadiusConstraint | null;
  // False while the pin is only showing the device's position rather than a
  // location the submitter has chosen.
  placed?: boolean;
}

const PICKER_ZOOM = 15;

function apply(
  constrainTo: RadiusConstraint | null | undefined,
  point: LatLngLiteral,
): LatLngLiteral {
  if (!constrainTo) return point;
  return clampToRadius(constrainTo.centre, point, constrainTo.radiusMeters);
}

// Click anywhere to move the pin. On a phone this is the primary interaction:
// dragging a 30px marker with a thumb is fiddly, tapping the spot is not.
function ClickToPlace({
  onPick,
  constrainTo,
}: {
  onPick: (next: LatLngLiteral) => void;
  constrainTo?: RadiusConstraint | null;
}) {
  useMapEvents({
    click: (event) => {
      onPick(
        apply(constrainTo, {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        }),
      );
    },
  });
  return null;
}

// Keeps the viewport following the chosen point when it changes from outside
// the map -- the first GPS fix, the "use my location" button, or a coordinate
// typed into the numeric fields.
//
// Which of those it is decides whether to animate, and the viewport answers
// that better than a prop could: a point already on screen is a nudge (a
// typed digit, a small correction), so it lands instantly -- animating every
// keystroke of a longitude is worse than useless. A point off screen is a
// jump to somewhere else entirely, overwhelmingly the first fix arriving and
// replacing the fallback centre, so it flies, the same as the main map's
// FirstFixController. Keeping your bearings matters exactly when the camera
// travels far.
function FollowPoint({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();

  useEffect(() => {
    const target: [number, number] = [latitude, longitude];
    if (map.getBounds().contains(target)) {
      map.setView(target, map.getZoom(), { animate: false });
      return;
    }
    map.flyTo(target, Math.max(map.getZoom(), PICKER_ZOOM), { duration: 0.9 });
  }, [map, latitude, longitude]);

  return null;
}

// Publishes the chosen point onto the container, the same affordance AR-21
// added to MapCanvas as data-map-centre and for the same reason: proving the
// pin actually moved is a fact about the Leaflet instance, and the
// alternatives are poking a private field or inferring it from tiles.
function PublishPickedAt({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();

  useEffect(() => {
    map.getContainer().dataset.pickedAt = `${latitude},${longitude}`;
  }, [map, latitude, longitude]);

  return null;
}

// Leaflet measures its container once at construction; inside a form whose
// height resolves after mount this leaves grey gaps where tiles belong.
function ResizeObserverBridge() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

// A needle: round head on a tapered spike whose tip is the actual
// coordinate. The old icon was a rotated rounded square anchored at [0,0],
// which pointed at nothing in particular -- you could not tell which pixel
// the latitude and longitude below the map referred to. The tip can, so
// iconAnchor is the tip, exactly.
//
// The tail is the pair of tangents from the tip (11,36) to the head circle
// (centre 11,11 / r 9), so the spike meets the head flush instead of
// overlapping it.
const PIN_SIZE: [number, number] = [22, 36];
const PIN_PATH =
  'M11 36 L2.6 14.24 A9 9 0 1 1 19.4 14.24 Z';

// `placed` false means the pin is showing where the submission *would* go --
// the device's position, before the submitter has actually chosen it. It is
// drawn hollow and half-transparent so it cannot be mistaken for a committed
// choice, which matters most for an admin: their pin now starts at a
// plausible location rather than an obviously-wrong one, and the form still
// refuses to submit until they tap.
const pickerIcon = (placed: boolean) =>
  L.divIcon({
    className: 'climb-picker-pin',
    html:
      `<svg data-testid="picker-pin" data-placed="${placed}" ` +
      `width="${PIN_SIZE[0]}" height="${PIN_SIZE[1]}" viewBox="0 0 22 36" ` +
      `style="display:block;opacity:${placed ? 1 : 0.65};` +
      `filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">` +
      `<path d="${PIN_PATH}" fill="${placed ? 'var(--color-clay-deep)' : 'none'}" ` +
      `stroke="var(--color-clay-deep)" stroke-width="2" stroke-linejoin="round"/>` +
      `<circle cx="11" cy="11" r="3.5" fill="var(--color-surface)"/>` +
      `</svg>`,
    iconSize: PIN_SIZE,
    iconAnchor: [PIN_SIZE[0] / 2, PIN_SIZE[1]],
  });

export default function LocationPickerCanvas({
  latitude,
  longitude,
  onPick,
  constrainTo = null,
  placed = true,
}: LocationPickerCanvasProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={PICKER_ZOOM}
      scrollWheelZoom
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
      data-testid="location-picker-map"
    >
      <AttributionControl position="bottomleft" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <ClickToPlace onPick={onPick} constrainTo={constrainTo} />
      <FollowPoint latitude={latitude} longitude={longitude} />
      <PublishPickedAt latitude={latitude} longitude={longitude} />
      <ResizeObserverBridge />

      {constrainTo ? (
        <Circle
          center={[constrainTo.centre.latitude, constrainTo.centre.longitude]}
          radius={constrainTo.radiusMeters}
          pathOptions={{
            color: 'var(--color-clay-deep)',
            weight: 1.5,
            fillColor: 'var(--color-clay)',
            fillOpacity: 0.12,
          }}
        />
      ) : null}

      <Marker
        position={[latitude, longitude]}
        icon={pickerIcon(placed)}
        draggable
        eventHandlers={{
          dragend: (event) => {
            const { lat, lng } = event.target.getLatLng();
            onPick(apply(constrainTo, { latitude: lat, longitude: lng }));
          },
        }}
        alt="Chosen location"
      />
    </MapContainer>
  );
}
