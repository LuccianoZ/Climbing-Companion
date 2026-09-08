'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  AttributionControl,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import type { MapPin } from '@/lib/types';
import { buildPinIcon } from './pin-icons';

// BL-019. This module imports `leaflet`, which reads `window` at import
// time -- so it must never be evaluated on the server. It is not imported
// directly anywhere: MapView.tsx is the only importer, and it does so
// through next/dynamic with ssr:false. Keeping the raw Leaflet surface in
// its own file is what makes that guarantee checkable by reading the import
// graph rather than trusting a comment.

export interface FlyToTarget {
  latitude: number;
  longitude: number;
  zoom?: number;
  // Changes on every fly-to request so repeating the same search twice
  // still re-centres the map. Without it, React sees an identical target
  // object value and the effect never re-runs.
  nonce: number;
}

export interface MapCanvasProps {
  pins: MapPin[];
  selectedPinId: string | null;
  onSelectPin: (pin: MapPin) => void;
  flyTo: FlyToTarget | null;
  viewer: { latitude: number; longitude: number } | null;
}

// Yosemite Valley. A neutral, unmistakably climbing-relevant default for a
// first load before any pin data or geolocation arrives -- the map has to
// render *somewhere*, and an all-ocean 0,0 reads as broken.
const DEFAULT_CENTER: [number, number] = [37.7338, -119.5676];
const DEFAULT_ZOOM = 12;
const FLY_TO_ZOOM = 16;
// Deliberately wider than FLY_TO_ZOOM: opening the app asks "what is
// around me", where tapping a search result asks "show me that one".
const FIRST_FIX_ZOOM = 14;

function FlyToController({ target }: { target: FlyToTarget | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }
    // BL-022's "fly to the match". flyTo animates rather than jumping, so
    // the climber keeps their bearings relative to where they were looking.
    map.flyTo([target.latitude, target.longitude], target.zoom ?? FLY_TO_ZOOM, {
      duration: 0.85,
    });
  }, [map, target]);

  return null;
}

// AR-32. The map has to render before geolocation resolves -- hence the
// Yosemite default above -- so it opens somewhere arbitrary and then moves
// once, on the first fix, to wherever the climber actually is.
//
// Imperative rather than MapScreen state: a one-shot camera move routed
// through setState in an effect is exactly what React 19's
// set-state-in-effect rule rejects (the same constraint AR-27 works around
// in the location picker). A ref makes it fire at most once per mount, so
// later position updates cannot yank the viewport back while someone is
// panning, and any directed target -- a deep link, a tapped pin, a search
// result -- suppresses it entirely rather than racing it.
function FirstFixController({
  viewer,
  suppressed,
}: {
  viewer: { latitude: number; longitude: number } | null;
  suppressed: boolean;
}) {
  const map = useMap();
  const flown = useRef(false);

  useEffect(() => {
    if (flown.current || suppressed || !viewer) {
      return;
    }
    flown.current = true;
    map.flyTo([viewer.latitude, viewer.longitude], FIRST_FIX_ZOOM, {
      duration: 0.9,
    });
  }, [map, viewer, suppressed]);

  return null;
}

// Publishes the map's live centre and zoom onto its own container element
// as data attributes.
//
// This exists because the BDD suite has to assert that BL-022's search
// actually *flew* the map, and that BL-019's pan and zoom are genuinely
// enabled -- both of which are facts about the Leaflet instance, not about
// any DOM node it renders. Leaflet keeps no public back-reference from a
// container to its map, and react-leaflet's instance lives inside a React
// context no external driver can reach, so the alternatives were to poke at
// a private field that could disappear in a patch release, or to infer the
// viewport from which tile images happened to load. Reflecting the state
// outward instead keeps the assertion honest and, as a side effect, makes
// the map's position readable in devtools while debugging.
function MapStatePublisher() {
  const map = useMap();

  useEffect(() => {
    const publish = () => {
      const centre = map.getCenter();
      const container = map.getContainer();
      container.dataset.mapCentre = `${centre.lat},${centre.lng}`;
      container.dataset.mapZoom = String(map.getZoom());
    };

    publish();
    map.on('move', publish);
    map.on('zoom', publish);
    return () => {
      map.off('move', publish);
      map.off('zoom', publish);
    };
  }, [map]);

  return null;
}

// Leaflet measures its container once at construction. Inside a flex column
// whose height resolves after mount (and after the bottom sheet opens and
// closes), that first measurement can be wrong and leaves grey gaps where
// tiles should be. Observing the container and invalidating is cheaper and
// more reliable than guessing at a timeout.
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

// "You are here", built the way every maps app builds it: a small solid core,
// a light ring that lifts it off the terrain, and a soft accuracy halo that
// breathes. The previous version was a flat 14px orange disc with a hard 5px
// orange ring, which at street zoom read as an unexplained blob roughly the
// size of a building rather than as a precise position.
//
// The pulse is CSS on a class defined in globals.css, not an inline style,
// because inline animation would escape the global prefers-reduced-motion
// collapse -- a location marker that throbs forever is exactly the kind of
// motion someone turns that setting on to stop.
const viewerIcon = () =>
  L.divIcon({
    className: 'climb-viewer-dot',
    html:
      '<span data-testid="viewer-dot" class="climb-viewer">' +
      '<span class="climb-viewer__halo"></span>' +
      '<span class="climb-viewer__core"></span>' +
      '</span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

export default function MapCanvas({
  pins,
  selectedPinId,
  onSelectPin,
  flyTo,
  viewer,
}: MapCanvasProps) {
  // Rebuilding a divIcon on every render would recreate every marker's DOM
  // on every geolocation tick, which throws away the badge nodes the UI
  // suite queries mid-assertion. Icons only depend on id/kind/status -- and,
  // since the Sept 8 revamp, on whether the pin is the selected one, which is
  // why `selectedPinId` joins the dependency list. It changes on tap, not on
  // every GPS fix, so the memo still holds across location ticks.
  const icons = useMemo(() => {
    const byId = new Map<string, L.DivIcon>();
    for (const pin of pins) {
      byId.set(pin.id, buildPinIcon(pin, pin.id === selectedPinId));
    }
    return byId;
  }, [pins, selectedPinId]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      // BL-019's acceptance criterion: full pan and zoom. All of Leaflet's
      // interaction handlers stay on; scrollWheelZoom is named explicitly
      // because it is the one a "map inside a scrolling page" layout is
      // usually forced to disable, and this layout deliberately does not
      // scroll behind the map.
      scrollWheelZoom
      zoomControl={false}
      // Switched off and re-added on the left below: the recentre button and
      // the submit + both live bottom-right, and the attribution sat directly
      // underneath them. Leaflet's corner for the built-in control is not
      // configurable, so the way to move it is to place your own.
      attributionControl={false}
      className="h-full w-full"
      data-testid="map-container"
    >
      <AttributionControl position="bottomleft" />
      {/* Free OSM raster tiles -- no API key, no billing account, per
          BL-019's card. Attribution is a licence requirement, not decoration.

          The Sept 8 2026 dark revamp briefly pointed this at CARTO's
          dark_matter basemap; that endpoint now answers with "API KEY
          REQUIRED" watermarked across every tile, so it is not the keyless
          option it used to be. The basemap is darkened in CSS instead --
          see the .leaflet-tile filter in globals.css -- which keeps BL-019's
          "no API key" constraint intact and keeps the attribution honest,
          since the tiles really are still plain OSM. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <FlyToController target={flyTo} />
      <FirstFixController viewer={viewer} suppressed={flyTo !== null} />
      <ResizeObserverBridge />
      <MapStatePublisher />

      {pins.map((pin) => (
        <Marker
          key={pin.id}
          position={[pin.latitude, pin.longitude]}
          icon={icons.get(pin.id) ?? buildPinIcon(pin)}
          // Selected pin rides above its neighbours so a badge from an
          // adjacent UNVERIFIED pin cannot cover the one being read.
          zIndexOffset={pin.id === selectedPinId ? 1000 : 0}
          eventHandlers={{ click: () => onSelectPin(pin) }}
          alt={pin.name}
        />
      ))}

      {viewer ? (
        <Marker
          position={[viewer.latitude, viewer.longitude]}
          icon={viewerIcon()}
          interactive={false}
          alt="Your location"
        />
      ) : null}
    </MapContainer>
  );
}
