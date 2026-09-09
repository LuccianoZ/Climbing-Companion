import L from 'leaflet';
import type { MapPin } from '@/lib/types';
import type { PinCluster } from './clustering';

// BL-020 + Sept 3 revision (AR-51, BL-x01): crags and gyms are visually
// distinct (two silhouettes, not just two colours), and every pin carries the
// entity NAME and an *italicised* two-state status pill -- "Verified" or
// "Unverified". The pill is shown for verified pins too, not only unverified.
//
// Built as Leaflet divIcons (real DOM) rather than image markers: the label
// and pill are text that must stay legible and assertable by the Playwright
// suite, and the state treatment is live CSS rather than a second set of PNGs
// that would drift from the palette.
//
// Every element carries a data attribute the suite reads
// (data-pin-kind / data-pin-status / data-testid) so scenarios read the DOM
// contract rather than screenshotting colours.
//
// REDESIGNED Sept 8 2026. The previous pin stacked three bordered boxes --
// a 32px body, a bordered name chip, then a bordered pill -- so ten pins on
// screen produced thirty competing rectangles and the map read as a list. Now:
//
//   * a 22px marker, sized against a building footprint at street zoom rather
//     than against the sheet it opens;
//   * SHAPE carries the crag/gym distinction (round vs square), because a
//     12px glyph inside a 22px marker is unreadable on a real screen;
//   * the name and status sit directly on the terrain with no plate, kept
//     legible by a carried text-shadow instead of a background;
//   * an accent ring on the selected pin, a state the old design could not
//     express at all.

const CRAG_GLYPH =
  '<path d="m3 19 6.5-11L14 15l2.5-4L21 19H3Z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>';

const GYM_GLYPH =
  '<rect x="4" y="4.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2.1"/>' +
  '<circle cx="9" cy="9" r="1.3" fill="currentColor"/>' +
  '<circle cx="15" cy="12.5" r="1.3" fill="currentColor"/>' +
  '<circle cx="9.5" cy="15.5" r="1.3" fill="currentColor"/>';

// BL-x13. A single climb line, deliberately quieter than the crag's massif:
// a route pin is a CHILD of the shape it replaced, and only ever renders at
// zoom 16+, where its parent crag is not on screen to be confused with it.
const ROUTE_GLYPH =
  '<path d="M12 20V7m0 0-3.5 3.5M12 7l3.5 3.5" fill="none" stroke="currentColor" ' +
  'stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>';

export const VERIFIED_BADGE_TEXT = 'Verified';
export const UNVERIFIED_BADGE_TEXT = 'Unverified';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPinIcon(pin: MapPin, selected = false): L.DivIcon {
  const unverified = pin.status === 'UNVERIFIED';
  const isRoute = pin.kind === 'ROUTE';
  const glyph =
    pin.kind === 'CRAG'
      ? CRAG_GLYPH
      : pin.kind === 'GYM'
        ? GYM_GLYPH
        : ROUTE_GLYPH;

  // Crags are a solid accent disc; gyms are a dark square outlined in accent.
  // Fill, shape and glyph all differ, so the distinction survives colour-blind
  // vision and a greyscale screenshot alike.
  // BL-020 / Foundation section 9: an UNVERIFIED pin is literally translucent
  // grey -- the dormant token as the FILL, at reduced opacity. Both halves
  // matter and both are asserted by map-ui.feature; a grey outline around a
  // transparent body is not the same treatment and does not read as "not yet
  // endorsed" against a dark basemap.
  const fill = unverified
    ? 'background:var(--color-dormant);opacity:0.6;' +
      'border-color:rgba(255,255,255,0.5);'
    : pin.kind === 'GYM'
      ? 'background:var(--color-surface-high);border-color:var(--color-clay-deep);'
      : 'background:var(--color-clay);border-color:rgba(255,255,255,0.92);';

  // A tight contact shadow only. The old pin carried a 14px coloured glow,
  // which on a dark basemap bled into its neighbours and made a cluster look
  // like one smeared light source.
  const shade = 'box-shadow:0 1px 4px rgba(0,0,0,0.75);';

  const ring = selected
    ? 'box-shadow:0 0 0 3px color-mix(in srgb, var(--color-clay) 45%, transparent),0 2px 8px rgba(0,0,0,0.8);'
    : '';

  const glyphColor = unverified
    ? 'var(--color-dormant)'
    : pin.kind === 'GYM'
      ? 'var(--color-clay-deep)'
      : 'var(--color-paper)';

  // A route reads as subordinate to the crag disc by SIZE, which is the one
  // channel still free -- shape already carries crag-vs-gym, and colour is
  // spoken for by the verified/unverified state.
  const baseSize = isRoute ? 16 : 22;
  const bodySize = selected ? baseSize + 6 : baseSize;
  const glyphSize = selected ? Math.round(bodySize * 0.57) : Math.round(baseSize * 0.59);

  // SHAPE is the primary crag/gym distinction, not the glyph. At 22px a
  // 12px line icon collapses into a smudge -- checked against a real render --
  // so the silhouette has to carry it: crags are round, gyms are square. The
  // glyph stays for the selected/zoomed case and for anyone reading the DOM,
  // and colour is the third, redundant channel. Foundation section 9's "two
  // silhouettes, not just two colours" is satisfied more literally this way.
  const shape = pin.kind === 'GYM' ? 'border-radius:3px;' : 'border-radius:50%;';

  const body =
    `<span data-testid="pin-body" ` +
    `class="flex items-center justify-center border-2" ` +
    `style="width:${bodySize}px;height:${bodySize}px;${shape}` +
    `${fill}${ring || shade}">` +
    `<svg viewBox="0 0 24 24" style="width:${glyphSize}px;height:${glyphSize}px;` +
    `color:${glyphColor}" aria-hidden="true">${glyph}</svg>` +
    `</span>`;

  // The label sits straight on the terrain with no chip, plate or border --
  // that is the single biggest reason the map read as a list of cards. Legibility
  // comes from a carried text-shadow (.climb-pin__label in globals.css), the way
  // every maps app labels a POI.
  //
  // Status is the label's own colour plus the italic word, which Foundation
  // section 9 requires on the pin; the pill keeps its testid and data attribute
  // because the suite asserts on both.
  const nameColor = unverified ? 'var(--color-ink-soft)' : '#fff';
  const statusColor = unverified
    ? 'var(--color-dormant)'
    : 'var(--color-moss-deep)';

  // A compact translucent backing, not the old bordered chip.
  //
  // Plate-free labels read beautifully on an empty map and fall apart the
  // moment two pins are close: with a crag and a gym 80m apart, the names and
  // both "Verified" pills pile into an illegible smudge, because Leaflet does
  // no label decluttering. A shadow alone cannot separate text from text.
  // This is the minimum that keeps overlapping labels individually readable
  // while staying far from the three-stacked-boxes design it replaced -- no
  // border, no hard edge, just enough ground to sit on.
  // BL-x13: a crag says how many climbs it holds, so the number the cluster
  // above it was quoting stays traceable all the way down to the pin. Omitted
  // for a single-route crag, where "1 route" is noise -- the crag and the
  // route share a name in that case anyway (AR-14).
  const routeLine =
    pin.kind === 'CRAG' && (pin.routeCount ?? 0) > 1
      ? `<span data-testid="pin-route-count" data-route-count="${pin.routeCount}" ` +
        `class="text-[9px] font-medium" style="color:var(--color-ink-soft)">${pin.routeCount} routes</span>`
      : '';

  const label =
    `<span class="climb-pin__label mt-1 flex max-w-[140px] flex-col items-center rounded-[2px] px-1.5 py-0.5 leading-tight" ` +
    `style="background:color-mix(in srgb, var(--color-paper) 72%, transparent)">` +
    `<span data-testid="pin-name" class="max-w-full truncate text-[11px] font-semibold" style="color:${nameColor}">${escapeHtml(pin.name)}</span>` +
    `<span data-testid="pin-status-pill" data-pin-verified="${unverified ? 'false' : 'true'}" ` +
    `class="text-[9px] font-medium italic" style="color:${statusColor}">${pillTextFor(unverified)}</span>` +
    routeLine +
    `</span>`;

  const html =
    `<div class="flex flex-col items-center" data-testid="map-pin" ` +
    `data-pin-id="${escapeHtml(pin.id)}" data-pin-kind="${pin.kind}" ` +
    `data-pin-status="${pin.status}" data-pin-selected="${selected ? 'true' : 'false'}" ` +
    `data-pin-name="${escapeHtml(pin.name)}">` +
    body +
    label +
    `</div>`;

  return L.divIcon({
    html,
    className: 'climb-pin',
    iconSize: [150, 60],
    // Anchor on the marker's centre, which is where the coordinate actually is.
    iconAnchor: [75, bodySize / 2],
    popupAnchor: [0, -bodySize / 2],
  });
}

function pillTextFor(unverified: boolean): string {
  return unverified ? UNVERIFIED_BADGE_TEXT : VERIFIED_BADGE_TEXT;
}


// BL-x13. The cluster marker: one disc carrying the total, with the
// composition spelled out underneath.
//
// The label counts CLIMBS and GYMS, never pins -- see clustering.ts. A
// climber zooming in watches "23 climbs · 3 gyms" break into smaller clusters
// and finally into individual pins, and at no point does the arithmetic stop
// adding up. Quoting crags instead would make the total leap the moment the
// route tier takes over, which reads as the map losing track.
//
// Sized by magnitude so a dense area is legible as dense before the text is
// readable -- the one thing the Snapchat-style treatment does that a fixed
// disc cannot.
export function buildClusterIcon(cluster: PinCluster): L.DivIcon {
  const total = cluster.climbCount + cluster.gymCount;
  const size = total >= 100 ? 52 : total >= 25 ? 46 : total >= 10 ? 40 : 34;

  const parts: string[] = [];
  if (cluster.climbCount > 0) {
    parts.push(`${cluster.climbCount} climb${cluster.climbCount === 1 ? '' : 's'}`);
  }
  if (cluster.gymCount > 0) {
    parts.push(`${cluster.gymCount} gym${cluster.gymCount === 1 ? '' : 's'}`);
  }

  const body =
    `<span data-testid="cluster-body" class="flex items-center justify-center rounded-full border-2 font-semibold" ` +
    `style="width:${size}px;height:${size}px;` +
    `background:color-mix(in srgb, var(--color-clay) 88%, transparent);` +
    `border-color:rgba(255,255,255,0.92);color:var(--color-paper);` +
    `font-size:${size >= 46 ? 15 : 13}px;` +
    `box-shadow:0 2px 8px rgba(0,0,0,0.7);">${total}</span>`;

  const label =
    `<span class="climb-pin__label mt-1 flex max-w-[150px] flex-col items-center rounded-[2px] px-1.5 py-0.5 leading-tight" ` +
    `style="background:color-mix(in srgb, var(--color-paper) 72%, transparent)">` +
    `<span data-testid="cluster-breakdown" class="truncate text-[10px] font-semibold" ` +
    `style="color:#fff">${parts.join(' \u00b7 ')}</span>` +
    `</span>`;

  const html =
    `<div class="flex flex-col items-center" data-testid="map-cluster" ` +
    `data-cluster-total="${total}" data-cluster-climbs="${cluster.climbCount}" ` +
    `data-cluster-gyms="${cluster.gymCount}" data-cluster-size="${cluster.pins.length}">` +
    body +
    label +
    `</div>`;

  return L.divIcon({
    html,
    className: 'climb-pin',
    iconSize: [150, 70],
    iconAnchor: [75, size / 2],
  });
}
