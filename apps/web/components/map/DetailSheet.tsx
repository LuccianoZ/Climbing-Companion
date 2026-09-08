'use client';

import { useEffect } from 'react';
import { CloseIcon } from '@/components/shell/icons';
import { ExpandableSheet, Pop, StaggerItem, StaggerList } from '@/components/ui/motion';
import { formatGrade, type GradeScale } from '@/lib/grades';
import { distanceMeters, formatDistance, isWithinProximity } from '@/lib/geo';
import {
  DISCIPLINE_LABELS,
  GEAR_REQUIREMENT_LABELS,
  GYM_DISCIPLINE_LABELS,
  SUPPORT_EMAIL,
  WEEKDAY_LABELS,
  type GymDetail,
  type GymDiscipline,
  type MapRouteSummary,
  type OperatingHours,
  type PinDetail,
} from '@/lib/types';
import { AddMorePhotosForm } from './AddMorePhotosForm';
import { GradeScaleToggle } from './GradeScaleToggle';
import { InRangeActions, type InRangeAction } from './InRangeActions';
import { PhotoGallery } from './PhotoGallery';
import { ReviewsSection } from './ReviewsSection';
import { VoteDistribution } from './VoteDistribution';

// BL-021 + Sept 3 revision (AR-51, BL-x01/x04/x05). The panel header shows
// the entity name above an italicised two-state status pill; a crag's route
// rows carry the same pill; a gym shows its weekly hours in its local time;
// and a "Photos pending admin approval" line appears while no submission
// photo for the entity has been approved.

export type DetailSheetState =
  | { status: 'loading'; name: string }
  | { status: 'error'; name: string }
  | { status: 'ready'; detail: PinDetail };

export function DetailSheet({
  state,
  viewer,
  viewerUserId,
  scale,
  onScaleChange,
  onAction,
  onClose,
}: {
  state: DetailSheetState;
  viewer: { latitude: number; longitude: number } | null;
  // AR-54: the signed-in viewer's own id, compared against a gym/route's
  // `submittedBy` to decide whether to show the "add more photos" form.
  // `null` for a signed-out Visitor -- the form never renders for one.
  viewerUserId: string | null;
  scale: GradeScale;
  onScaleChange: (next: GradeScale) => void;
  onAction: (action: InRangeAction) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const detail = state.status === 'ready' ? state.detail : null;
  const distance =
    detail && viewer
      ? distanceMeters(viewer, {
          latitude: detail.latitude,
          longitude: detail.longitude,
        })
      : null;
  const inRange =
    detail !== null &&
    viewer !== null &&
    isWithinProximity(viewer, {
      latitude: detail.latitude,
      longitude: detail.longitude,
    });

  const canVerify =
    detail === null
      ? false
      : detail.kind === 'CRAG'
        ? detail.routes.some((route) => route.status !== 'VERIFIED')
        : detail.status !== 'VERIFIED';

  const hasRoutes = detail?.kind === 'CRAG' ? detail.routes.length > 0 : false;

  return (
    // inset-0, not bottom-0 + max-h: the panel is now as tall as the map area
    // and is translated down to its resting position, so dragging the handle
    // up fills the screen the way a maps app does. Capping it at 72% was the
    // reason a gym's hours, photos and reviews had to be read through a
    // letterbox.
    <ExpandableSheet
      onClose={onClose}
      label="Location details"
      testId="detail-sheet"
      data={{ 'data-detail-kind': detail?.kind ?? 'PENDING' }}
      className="pointer-events-auto absolute inset-0 z-[1100] flex flex-col overflow-hidden rounded-t-card border-t border-line bg-surface shadow-overlay"
    >
      {({ startDrag, expanded }) => (
        <>
      <div className="shrink-0 bg-surface pt-2">
        {/* Drag lives on the handle only -- the panel below it scrolls a
            crag's full route list, and a body-wide listener would eat that. */}
        <span
          onPointerDown={startDrag}
          data-testid="detail-grabber"
          aria-hidden
          className="mx-auto flex h-6 w-20 cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing"
        >
          <span className="block h-1 w-10 rounded-full bg-line" />
        </span>
        {/* The header is the sheet's hero, not a caption. The name runs at
            display size in the condensed face -- a crag called "Devil's
            Staircase" should read like a place you are standing in, not like
            a table row -- and the distance is promoted to a STAT, because it
            is the number the entire product gates on. */}
        <div
          className={[
            'flex items-start justify-between gap-3 px-5',
            expanded ? 'pb-0 pt-1' : 'pb-1 pt-2',
          ].join(' ')}
        >
          <div className="min-w-0 flex-1">
            {/* BL-x01: name above the italicised status pill.

                Expanded, the header compacts: the name drops a step and the
                pill moves up beside it. The hero treatment earns its space
                while the sheet is resting over the map and the name is the
                only thing to read; once the panel is full the content below
                is what the climber came for, and 40px of title plus a 56px
                distance figure is just a wall to scroll past. font-size and
                line-height both animate, so it eases rather than snaps. */}
            <div className={expanded ? 'flex items-center gap-2.5' : ''}>
              <h2
                className={[
                  'display truncate text-ink transition-[font-size,line-height] duration-(--dur-base) ease-standard',
                  expanded ? 'text-title' : 'text-display',
                ].join(' ')}
              >
                {state.status === 'ready' ? state.detail.name : state.name}
              </h2>
              {detail && expanded ? (
                <StatusPill status={detail.status} context="header" compact />
              ) : null}
            </div>
            {detail && !expanded ? (
              <div className="mt-2">
                <StatusPill status={detail.status} context="header" />
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {detail?.kind === 'CRAG' ? (
              <GradeScaleToggle scale={scale} onChange={onScaleChange} />
            ) : null}
            <button
              type="button"
              aria-label="Close details"
              data-testid="detail-close"
              onClick={onClose}
              className="press rounded-control border border-line p-1.5 text-ink-soft"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Distance as a headline figure with a hairline label under it. The
            old treatment ("Distance: 120m" at 11px) buried the one number a
            climber is actually checking when they open this panel. */}
        <div
          className={[
            'flex items-end gap-2 px-5',
            expanded ? 'pb-2 pt-0' : 'pb-4 pt-1',
          ].join(' ')}
        >
          <span
            className={[
              'stat transition-[font-size,line-height] duration-(--dur-base) ease-standard',
              expanded ? 'text-title' : 'text-stat',
              inRange ? 'text-moss-deep' : 'text-ink',
            ].join(' ')}
          >
            {distance !== null ? formatDistance(distance) : '—'}
          </span>
          <span
            className={[
              'label-caps',
              expanded ? 'pb-0.5' : 'pb-1.5',
              inRange ? 'text-moss-deep' : 'text-ink-faint',
            ].join(' ')}
          >
            {distance === null && viewer === null
              ? 'No location'
              : inRange
                ? 'In range'
                : 'Away'}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
        {state.status === 'loading' ? (
          <p data-testid="detail-loading" className="py-6 text-center text-small text-ink-faint">
            Loading details…
          </p>
        ) : null}

        {state.status === 'error' ? (
          <p data-testid="detail-error" className="py-6 text-center text-small text-clay-deep">
            We couldn&apos;t load this location. It may have been archived.
          </p>
        ) : null}

        {detail ? (
          <>
            <InRangeActions
              inRange={inRange}
              kind={detail.kind}
              canVerify={canVerify}
              hasRoutes={hasRoutes}
              onAction={onAction}
            />

            {detail.kind === 'GYM' ? (
              <GymBody gym={detail} viewerUserId={viewerUserId} />
            ) : (
              <CragBody
                routes={detail.routes}
                scale={scale}
                viewerUserId={viewerUserId}
              />
            )}

            {/* BL-045: reviews live at the bottom of the panel (Foundation
                §9), on any lifecycle status. Composing needs a session. */}
            <ReviewsSection
              targetType={detail.kind}
              targetId={detail.id}
              canWrite={viewerUserId !== null}
            />
          </>
        ) : null}
      </div>
        </>
      )}
    </ExpandableSheet>
  );
}

// BL-x01: the two-state italicised pill. `context` only tunes the size --
// the header instance sits under the name, a route-row instance sits beside
// its route name.
export function StatusPill({
  status,
  context,
  compact = false,
}: {
  status: PinDetail['status'];
  // Decides the test id and therefore the pill's identity to the UI suite --
  // `header` is the detail panel's own pill (Foundation section 9), `row` is a
  // route row's. Never switch this to change appearance; use `compact`.
  context: 'header' | 'row';
  compact?: boolean;
}) {
  const verified = status === 'VERIFIED';
  // Uppercase condensed at both sizes -- this is signage, not a sentence.
  const size =
    context === 'header' && !compact
      ? 'display not-italic text-caption tracking-[0.12em] px-2.5 py-1'
      : 'display not-italic text-caption tracking-[0.1em] px-1.5 py-[2px]';
  return (
    <Pop className={context === 'header' ? 'mt-1 inline-block' : 'inline-block'}>
    <span
      data-testid={
        context === 'header'
          ? verified
            ? 'detail-status-verified'
            : 'detail-status-unverified'
          : 'route-status-pill'
      }
      data-verified={verified ? 'true' : 'false'}
      className={[
        'inline-flex items-center gap-1.5 font-semibold italic',
        size,
        // Accent as a field: verified is a solid affirmative block with dark
        // text on it, not an outlined badge. Never colour alone -- the italic
        // word is required by Foundation section 9 and rides along regardless.
        // Unverified stays deliberately flat and unfilled: the absence of a
        // field is what reads as "not yet endorsed".
        verified
          ? 'field-affirm'
          : 'border border-dormant/45 bg-transparent text-ink-soft',
      ].join(' ')}
    >
      {verified ? 'Verified' : 'Unverified'}
    </span>
    </Pop>
  );
}

// BL-x05: shown while no submission photo for the entity has been approved.
function PhotosPendingNotice() {
  return (
    <p
      data-testid="photos-pending"
      className="rounded-control border border-dashed border-line bg-paper px-3 py-2 text-caption font-medium text-ink-soft"
    >
      Photos pending admin approval
    </p>
  );
}

function GymBody({
  gym,
  viewerUserId,
}: {
  gym: GymDetail;
  viewerUserId: string | null;
}) {
  return (
    <div className="space-y-4">
      {gym.photoMediaIds.length > 0 ? (
        <PhotoGallery photoIds={gym.photoMediaIds} />
      ) : gym.photosPending ? (
        <PhotosPendingNotice />
      ) : null}
      {viewerUserId !== null && viewerUserId === gym.submittedBy ? (
        <AddMorePhotosForm kind="GYM" entityId={gym.id} />
      ) : null}

      <div data-testid="gym-disciplines">
        <p className="label-caps text-caption text-ink-faint">
          Disciplines offered
        </p>
        {gym.disciplinesOffered.length === 0 ? (
          <p className="mt-1.5 text-small text-ink-faint">None listed.</p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {gym.disciplinesOffered.map((discipline: GymDiscipline) => (
              <li
                key={discipline}
                data-testid="gym-discipline"
                className="chip border border-line bg-paper text-ink"
              >
                {GYM_DISCIPLINE_LABELS[discipline] ?? discipline}
              </li>
            ))}
          </ul>
        )}
      </div>

      <OperatingHoursView
        hours={gym.operatingHours}
        timezone={gym.ianaTimezone}
      />
    </div>
  );
}

function formatRange(opens: string, closes: string, fullDay: boolean): string {
  if (fullDay) return 'Open 24 hours';
  const overnight = closes < opens;
  return `${opens} – ${closes}${overnight ? ' (next day)' : ''}`;
}

// BL-x04: rendered in the gym's own local time. `openNow` is a best-effort
// convenience computed from the viewer's clock shifted into the gym's zone.
function OperatingHoursView({
  hours,
  timezone,
}: {
  hours: OperatingHours;
  timezone: string;
}) {
  const openNow = isOpenNow(hours, timezone);

  return (
    <div data-testid="gym-hours">
      <div className="flex items-center justify-between">
        <p className="label-caps text-caption text-ink-faint">Hours</p>
        {openNow !== null ? (
          <span
            data-testid="gym-open-now"
            data-open={openNow ? 'true' : 'false'}
            className={[
              'rounded-full border px-2 py-[1px] text-caption font-bold uppercase',
              openNow
                ? 'border-moss-deep bg-moss-wash text-moss-deep'
                : 'border-line-soft bg-paper text-ink-soft',
            ].join(' ')}
          >
            {openNow ? 'Open now' : 'Closed now'}
          </span>
        ) : null}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-caption">
        {WEEKDAY_LABELS.map((label, day) => {
          const ranges = hours[String(day)] ?? [];
          return (
            <li key={day} className="flex justify-between gap-3">
              <span className="text-ink-soft">{label}</span>
              <span className="text-right font-medium text-ink">
                {ranges.length === 0
                  ? 'Closed'
                  : ranges
                      .map((r) => formatRange(r.opens, r.closes, r.fullDay))
                      .join(', ')}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-caption text-ink-faint">
        Shown in the gym&apos;s local time ({timezone}).
      </p>
      {/* AR-51 BL-x08 / §13: hours corrections are handled by email, not an
          in-app form. Verifiers on site use the "something's wrong" path
          during verification instead. */}
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Gym hours correction')}`}
        data-testid="gym-hours-support"
        className="mt-1 block text-caption text-ink-soft underline decoration-line-soft underline-offset-2"
      >
        Hours wrong? Email support to update them.
      </a>
    </div>
  );
}

// Returns null if the timezone is unusable in this browser. Otherwise: is
// "now", in the gym's zone, inside one of that weekday's ranges (accounting
// for a range that started the previous day and runs past midnight)?
function isOpenNow(hours: OperatingHours, timezone: string): boolean | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
  } catch {
    return null;
  }

  const lookup = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = weekdayMap[lookup('weekday')];
  if (day === undefined) return null;
  const minutes = Number(lookup('hour')) * 60 + Number(lookup('minute'));

  const inRanges = (dayIndex: number, fromPrevDay: boolean): boolean =>
    (hours[String(dayIndex)] ?? []).some((r) => {
      if (r.fullDay) return !fromPrevDay;
      const open = toMin(r.opens);
      const close = toMin(r.closes);
      if (close < open) {
        // Overnight: counts for the rest of today, and the start of tomorrow.
        return fromPrevDay ? minutes < close : minutes >= open;
      }
      return fromPrevDay ? false : minutes >= open && minutes < close;
    });

  return inRanges(day, false) || inRanges((day + 6) % 7, true);
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function CragBody({
  routes,
  scale,
  viewerUserId,
}: {
  routes: MapRouteSummary[];
  scale: GradeScale;
  viewerUserId: string | null;
}) {
  if (routes.length === 0) {
    return (
      <p data-testid="crag-no-routes" className="text-small text-ink-faint">
        No visible routes at this crag.
      </p>
    );
  }

  return (
    <div data-testid="crag-routes">
      {/* Section marker: a thick accent rule with the count as a figure, in
          place of the old 9.5px grey caption nobody's eye stopped on. */}
      <div className="rule-accent mb-3 flex items-baseline gap-2">
        <span className="stat text-title text-ink">{routes.length}</span>
        <span className="label-caps text-ink-faint">
          {routes.length === 1 ? 'Route' : 'Routes'}
        </span>
      </div>
      <StaggerList className="space-y-2">
        {routes.map((route) => (
          <StaggerItem key={route.id}>
            <RouteCard
              route={route}
              scale={scale}
              viewerUserId={viewerUserId}
            />
          </StaggerItem>
        ))}
      </StaggerList>
    </div>
  );
}

function RouteCard({
  route,
  scale,
  viewerUserId,
}: {
  route: MapRouteSummary;
  scale: GradeScale;
  viewerUserId: string | null;
}) {
  const progress = Math.min(
    1,
    route.verificationCount / route.verificationsRequired,
  );

  return (
    <article
      data-testid="route-card"
      data-route-name={route.name}
      data-route-status={route.status}
      // No card box. A bordered card per route inside a bordered panel inside
      // a sheet was three frames around one row; a left rule and a divider do
      // the same grouping and let the grade breathe.
      className="space-y-3 border-l-2 border-line-soft py-2 pl-3"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="display truncate text-heading text-ink">{route.name}</h3>
          <p className="label-caps mt-0.5 text-ink-faint">
            {DISCIPLINE_LABELS[route.discipline]}
          </p>
          {/* BL-x01: the same italicised pill, on each route row. */}
          <div className="mt-1.5">
            <StatusPill status={route.status} context="row" />
          </div>
        </div>
        {/* The grade IS the content of a route row -- it is what a climber
            scans the list for -- so it is set as a figure, not boxed in a
            bordered chip at 13px. */}
        <span
          data-testid="route-grade"
          data-grade-source={route.grade.source}
          className="shrink-0 text-right"
        >
          <span className="stat block text-title text-clay-deep">
            {formatGrade(route.grade.gradeOrdinal, route.discipline, scale)}
          </span>
          <span className="label-caps mt-1 block text-ink-faint">
            {route.grade.source === 'CONSENSUS' ? 'Consensus' : 'Proposed'}
          </span>
        </span>
      </header>

      {route.photoMediaIds.length > 0 ? (
        <PhotoGallery photoIds={route.photoMediaIds} />
      ) : route.photosPending ? (
        <PhotosPendingNotice />
      ) : null}
      {viewerUserId !== null && viewerUserId === route.submittedBy ? (
        <AddMorePhotosForm kind="ROUTE" entityId={route.id} />
      ) : null}

      <p className="text-small leading-relaxed text-ink-soft">{route.summary}</p>

      {route.gearRequirements.length > 0 ? (
        <div data-testid="route-gear">
          <p className="label-caps text-ink-faint">Gear</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {route.gearRequirements.map((item) => (
              <li
                key={item}
                data-testid="gear-chip"
                data-gear={item}
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-caption font-medium text-ink"
              >
                {GEAR_REQUIREMENT_LABELS[item] ?? item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {route.discipline !== 'BOULDERING' &&
      (route.boltCount !== null || route.minRopeLengthM !== null) ? (
        <dl
          data-testid="route-rope-details"
          className="flex gap-4 text-caption text-ink-soft"
        >
          {route.boltCount !== null ? (
            <div className="flex gap-1.5">
              <dt className="text-ink-faint">Bolts</dt>
              <dd className="font-semibold text-ink">{route.boltCount}</dd>
            </div>
          ) : null}
          {route.minRopeLengthM !== null ? (
            <div className="flex gap-1.5">
              <dt className="text-ink-faint">Min rope</dt>
              <dd className="font-semibold text-ink">{route.minRopeLengthM}m</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div data-testid="verification-progress" className="space-y-1">
        <div className="flex items-center justify-between text-caption text-ink-soft">
          <span className="label-caps text-caption text-ink-faint">
            Verification progress
          </span>
          <span data-testid="verification-count">
            {route.verificationCount} of {route.verificationsRequired} approved
          </span>
        </div>
        <span className="block h-2 overflow-hidden rounded-full bg-line-soft">
          <span
            className="block h-full rounded-full bg-moss"
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      </div>

      <VoteDistribution
        grade={route.grade}
        discipline={route.discipline}
        scale={scale}
      />
    </article>
  );
}
