import L from 'leaflet';
import type { MapPin } from '@/lib/types';

// BL-020 + Sept 3 revision (AR-51, BL-x01): crags and gyms are visually
// distinct (two silhouettes, not just two colours), and every pin now
// carries the entity NAME above an *italicised* two-state status pill --
// muted green "Verified" or translucent grey "Unverified". The pill is
// shown for verified pins too now, not only unverified. (Owner shortened
// the wording from "... by Community" on Sept 3.)
//
// Built as Leaflet divIcons (real DOM) rather than image markers: the label
// and pill are text that must stay legible and assertable by the Playwright
// suite, and the translucent treatment is a live CSS opacity rather than a
// second set of PNGs that would drift from the palette.
//
// Every element carries a data attribute the suite reads
// (data-pin-kind / data-pin-status / data-testid) so scenarios read the DOM
// contract rather than screenshotting colours.

const CRAG_GLYPH =
  '<path d="m3 19 6.5-11L14 15l2.5-4L21 19H3Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>';

const GYM_GLYPH =
  '<rect x="4" y="4.5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
  '<circle cx="9" cy="9" r="1.2" fill="currentColor"/>' +
  '<circle cx="15" cy="12.5" r="1.2" fill="currentColor"/>' +
  '<circle cx="9.5" cy="15.5" r="1.2" fill="currentColor"/>';

export const VERIFIED_BADGE_TEXT = 'Verified';
export const UNVERIFIED_BADGE_TEXT = 'Unverified';

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

  const shapeClass =
    pin.kind === 'CRAG' ? 'rounded-full rounded-br-[4px]' : 'rounded-[7px]';

  const bodyStyle = unverified
    ? 'background:var(--color-dormant);opacity:0.55;border-color:var(--color-ink);'
    : pin.kind === 'CRAG'
      ? 'background:var(--color-clay);border-color:var(--color-ink);'
      : 'background:var(--color-ink);border-color:var(--color-ink);';

  const glyphColor = unverified
    ? 'var(--color-ink)'
    : pin.kind === 'CRAG'
      ? 'var(--color-ink)'
      : 'var(--color-paper)';

  // BL-x01: name label, then the italicised status pill under it.
  const pillStyle = unverified
    ? 'background:var(--color-surface);border-color:var(--color-line-soft);color:var(--color-ink-soft);opacity:0.9;'
    : 'background:var(--color-moss-wash);border-color:var(--color-moss-deep);color:var(--color-moss-deep);';
  const pillText = unverified ? UNVERIFIED_BADGE_TEXT : VERIFIED_BADGE_TEXT;

  const label =
    `<span data-testid="pin-name" class="mt-1 max-w-[132px] truncate rounded-[6px] border border-line bg-surface px-1.5 py-[2px] text-[9px] font-bold leading-tight text-ink">${escapeHtml(pin.name)}</span>` +
    `<span data-testid="pin-status-pill" data-pin-verified="${unverified ? 'false' : 'true'}" class="mt-[3px] whitespace-nowrap rounded-full border px-1.5 py-[1px] text-[8px] font-semibold italic leading-none" style="${pillStyle}">${pillText}</span>`;

  const html =
    `<div class="flex flex-col items-center" data-testid="map-pin" data-pin-id="${escapeHtml(pin.id)}" data-pin-kind="${pin.kind}" data-pin-status="${pin.status}" data-pin-name="${escapeHtml(pin.name)}">` +
    `<span data-testid="pin-body" class="flex h-8 w-8 items-center justify-center border-[1.5px] ${shapeClass}" style="${bodyStyle}">` +
    `<svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" style="color:${glyphColor}" aria-hidden="true">${glyph}</svg>` +
    `</span>` +
    label +
    `</div>`;

  return L.divIcon({
    html,
    className: 'climb-pin',
    // Taller now that every pin carries a name + pill under the body.
    iconSize: [160, 74],
    iconAnchor: [80, 32],
    popupAnchor: [0, -32],
  });
}
