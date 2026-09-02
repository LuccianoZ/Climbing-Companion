'use client';

import { useEffect } from 'react';
import {
  AttributionControl,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';

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

export interface LocationPickerCanvasProps {
  latitude: number;
  longitude: number;
  onPick: (next: { latitude: number; longitude: number }) => void;
}

const PICKER_ZOOM = 15;

// Click anywhere to move the pin. On a phone this is the primary interaction:
// dragging a 30px marker with a thumb is fiddly, tapping the spot is not.
function ClickToPlace({
  onPick,
}: {
  onPick: (next: { latitude: number; longitude: number }) => void;
}) {
  useMapEvents({
    click: (event) => {
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

// Keeps the viewport following the chosen point when it changes from outside
// the map -- the "use my location" button, or a coordinate typed into the
// numeric fields. setView rather than flyTo: a typed correction should land
// immediately rather than animate, and animating on every keystroke of a
// longitude is worse than useless.
function FollowPoint({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom(), { animate: false });
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

const pickerIcon = () =>
  L.divIcon({
    className: 'climb-picker-pin',
    html:
      '<span data-testid="picker-pin" class="block h-[26px] w-[26px] -translate-x-1/2 -translate-y-full rounded-full rounded-bl-none border-[1.5px] border-[color:var(--color-line)] rotate-45" style="background:var(--color-clay-deep)"></span>',
    iconSize: [26, 26],
    iconAnchor: [0, 0],
  });

export default function LocationPickerCanvas({
  latitude,
  longitude,
  onPick,
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

      <ClickToPlace onPick={onPick} />
      <FollowPoint latitude={latitude} longitude={longitude} />
      <PublishPickedAt latitude={latitude} longitude={longitude} />
      <ResizeObserverBridge />

      <Marker
        position={[latitude, longitude]}
        icon={pickerIcon()}
        draggable
        eventHandlers={{
          dragend: (event) => {
            const { lat, lng } = event.target.getLatLng();
            onPick({ latitude: lat, longitude: lng });
          },
        }}
        alt="Chosen location"
      />
    </MapContainer>
  );
}
