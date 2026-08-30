import L from 'leaflet';
import type { MapPin } from '@/lib/types';

// BL-020: crags and gyms must be visually distinct, and an UNVERIFIED
// entry must render translucent grey with an "Unverified by Community"
// badge while a VERIFIED one carries neither treatment.
//
// Built as Leaflet divIcons (real DOM) rather than image markers, for two
// reasons that both matter to this story specifically: the badge is text
// that has to stay legible and selectable by an automated test, and the
// translucent treatment is a CSS opacity on live nodes rather than a second
// set of pre-rendered PNGs that would drift out of sync with the palette.
//
// Every element carries a data attribute the Playwright suite asserts on
// (data-pin-kind / data-pin-status / data-testid), so the BDD scenarios
// read the DOM contract rather than screenshotting colors.

const CRAG_GLYPH =
  '<path d="m3 19 6.5-11L14 15l2.5-4L21 19H3Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>';

const GYM_GLYPH =
  '<rect x="4" y="4.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
  '<circle cx="9" cy="9" r="1.2" fill="currentColor"/>' +
  '<circle cx="15" cy="12.5" r="1.2" fill="currentColor"/>' +
  '<circle cx="9.5" cy="15.5" r="1.2" fill="currentColor"/>';

export const UNVERIFIED_BADGE_TEXT = 'Unverified by Community';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPinIcon(pin: MapPin): L.DivIcon {
  const unverified = pin.status === 'UNVERIFIED';
  const glyph = pin.kind === 'CRAG' ? CRAG_GLYPH : GYM_GLYPH;

  // Crag: clay-filled teardrop. Gym: ink-filled square-shouldered pin.
  // Two different silhouettes, not merely two different colors -- color
  // alone would collapse for a colour-blind climber and would also collide
  // with the translucent-grey UNVERIFIED treatment layered on top of it.
  const shapeClass =
    pin.kind === 'CRAG'
      ? 'rounded-full rounded-br-[4px]'
      : 'rounded-[7px]';

  const bodyStyle = unverified
    ? // The BL-020 treatment: translucent grey, on both kinds.
      'background:var(--color-dormant);opacity:0.55;border-color:var(--color-ink);'
    : pin.kind === 'CRAG'
      ? 'background:var(--color-clay);border-color:var(--color-ink);'
      : 'background:var(--color-ink);border-color:var(--color-ink);';

  const glyphColor = unverified
    ? 'var(--color-ink)'
    : pin.kind === 'CRAG'
      ? 'var(--color-ink)'
      : 'var(--color-paper)';

  const badge = unverified
    ? `<span data-testid="pin-unverified-badge" class="mt-1 whitespace-nowrap rounded-full border border-line bg-surface px-1.5 py-[2px] text-[8.5px] font-semibold leading-none text-ink-soft">${UNVERIFIED_BADGE_TEXT}</span>`
    : '';

  const html =
    `<div class="flex flex-col items-center" data-testid="map-pin" data-pin-id="${escapeHtml(pin.id)}" data-pin-kind="${pin.kind}" data-pin-status="${pin.status}" data-pin-name="${escapeHtml(pin.name)}">` +
    `<span data-testid="pin-body" class="flex h-8 w-8 items-center justify-center border-[1.5px] ${shapeClass}" style="${bodyStyle}">` +
    `<svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" style="color:${glyphColor}" aria-hidden="true">${glyph}</svg>` +
    `</span>` +
    badge +
    `</div>`;

  return L.divIcon({
    html,
    // Leaflet's default marker class paints a background image; opting out
    // entirely keeps the divIcon to exactly the markup above.
    className: 'climb-pin',
    // Width is generous enough for the badge; the anchor puts the point of
    // the pin body -- not the badge underneath it -- on the coordinate.
    iconSize: [140, 52],
    iconAnchor: [70, 32],
    popupAnchor: [0, -32],
  });
}
