'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  AttributionControl,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import type { MapPin } from '@/lib/types';
import { buildClusterIcon, buildPinIcon } from './pin-icons';
import { clusterPins, selectTier, zoomToBreak } from './clustering';

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

// BL-x13. Everything zoom-dependent lives here rather than in MapCanvas
// because it needs `useMap()`, which is only available to a DESCENDANT of
// MapContainer -- MapCanvas itself renders the container and so sits outside
// its own context.
//
// The live zoom is read with useSyncExternalStore rather than mirrored into
// useState from an effect. Leaflet's zoom is external mutable state and this
// is precisely the hook React 19 provides for subscribing to it; the effect +
// setState shape is the one AR-32 already documents React 19 as rejecting.
//
// It subscribes to `zoomend`, not `zoom`. Leaflet fires `zoom` continuously
// through an animation, and re-clustering every frame would rebuild every
// marker's DOM mid-flight -- visibly, and out from under any Playwright
// locator that had already resolved.
function PinLayer({
  pins,
  selectedPinId,
  onSelectPin,
}: {
  pins: MapPin[];
  selectedPinId: string | null;
  onSelectPin: (pin: MapPin) => void;
}) {
  const map = useMap();

  const subscribe = useCallback(
    (onChange: () => void) => {
      map.on('zoomend', onChange);
      return () => {
        map.off('zoomend', onChange);
      };
    },
    [map],
  );

  const zoom = useSyncExternalStore(
    subscribe,
    () => map.getZoom(),
    () => DEFAULT_ZOOM,
  );

  // Tier first, then clustering over whatever that tier produced -- the two
  // never group the same pins at the same moment.
  const entries = useMemo(
    () => clusterPins(selectTier(pins, zoom), zoom),
    [pins, zoom],
  );

  // Rebuilding a divIcon on every render would recreate every marker's DOM
  // on every geolocation tick, which throws away the badge nodes the UI
  // suite queries mid-assertion. Icons depend only on the entry set and on
  // which pin is selected -- both of which change on tap or zoom, not on
  // every GPS fix, so the memo still holds across location ticks.
  const icons = useMemo(() => {
    const byKey = new Map<string, L.DivIcon>();
    for (const entry of entries) {
      if (entry.type === 'PIN') {
        byKey.set(entry.pin.id, buildPinIcon(entry.pin, entry.pin.id === selectedPinId));
      } else {
        byKey.set(entry.cluster.id, buildClusterIcon(entry.cluster));
      }
    }
    return byKey;
  }, [entries, selectedPinId]);

  return (
    <>
      {entries.map((entry) =>
        entry.type === 'PIN' ? (
          <Marker
            key={entry.pin.id}
            position={[entry.pin.latitude, entry.pin.longitude]}
            icon={icons.get(entry.pin.id) ?? buildPinIcon(entry.pin)}
            // Selected pin rides above its neighbours so a badge from an
            // adjacent UNVERIFIED pin cannot cover the one being read.
            zIndexOffset={entry.pin.id === selectedPinId ? 1000 : 0}
            eventHandlers={{ click: () => onSelectPin(entry.pin) }}
            alt={entry.pin.name}
          />
        ) : (
          <Marker
            key={entry.cluster.id}
            position={[entry.cluster.latitude, entry.cluster.longitude]}
            icon={icons.get(entry.cluster.id) ?? buildClusterIcon(entry.cluster)}
            eventHandlers={{
              // Zoom INTO the cluster rather than opening a list of its
              // members: the cluster is a rendering artefact, not an entity,
              // and it has no detail panel of its own to show. Two zoom
              // levels is enough to separate all but co-located pins.
              click: () =>
                map.flyTo(
                  [entry.cluster.latitude, entry.cluster.longitude],
                  zoomToBreak(zoom),
                  { duration: 0.6 },
                ),
            }}
            alt={`${entry.cluster.pins.length} nearby locations`}
          />
        ),
      )}
    </>
  );
}

export default function MapCanvas({
  pins,
  selectedPinId,
  onSelectPin,
  flyTo,
  viewer,
}: MapCanvasProps) {
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

      <PinLayer
        pins={pins}
        selectedPinId={selectedPinId}
        onSelectPin={onSelectPin}
      />

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
