'use client';

import { useEffect } from 'react';
import { CloseIcon } from '@/components/shell/icons';
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
import { GradeScaleToggle } from './GradeScaleToggle';
import { InRangeActions, type InRangeAction } from './InRangeActions';
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
  scale,
  onScaleChange,
  onAction,
  onClose,
}: {
  state: DetailSheetState;
  viewer: { latitude: number; longitude: number } | null;
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
    <section
      role="dialog"
      aria-label="Location details"
      data-testid="detail-sheet"
      data-detail-kind={detail?.kind ?? 'PENDING'}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1100] max-h-[72%] overflow-y-auto rounded-t-[18px] border-t-[1.5px] border-line bg-surface shadow-[0_-6px_0_rgba(20,17,15,0.08)]"
    >
      <div className="sticky top-0 z-10 bg-surface pt-2">
        <span className="mx-auto block h-1 w-10 rounded-full bg-line-soft" />
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-2.5">
          <div className="min-w-0">
            {/* BL-x01: name above the italicised status pill. */}
            <h2 className="label-caps truncate text-[15px] text-ink">
              {state.status === 'ready' ? state.detail.name : state.name}
            </h2>
            {detail ? (
              <StatusPill status={detail.status} context="header" />
            ) : null}
            <p className="mt-1 text-[11px] text-ink-soft">
              {distance !== null
                ? `Distance: ${formatDistance(distance)}`
                : viewer === null
                  ? 'Location unavailable'
                  : '—'}
            </p>
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
              className="rounded-full border border-line-soft p-1 text-ink-soft"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pb-6">
        {state.status === 'loading' ? (
          <p data-testid="detail-loading" className="py-6 text-center text-xs text-ink-faint">
            Loading details…
          </p>
        ) : null}

        {state.status === 'error' ? (
          <p data-testid="detail-error" className="py-6 text-center text-xs text-clay-deep">
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
              <GymBody gym={detail} />
            ) : (
              <CragBody routes={detail.routes} scale={scale} />
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

// BL-x01: the two-state italicised pill. `context` only tunes the size --
// the header instance sits under the name, a route-row instance sits beside
// its route name.
export function StatusPill({
  status,
  context,
}: {
  status: PinDetail['status'];
  context: 'header' | 'row';
}) {
  const verified = status === 'VERIFIED';
  const size = context === 'header' ? 'text-[10px] px-2 py-[2px]' : 'text-[8.5px] px-1.5 py-[1px]';
  return (
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
        context === 'header' ? 'mt-1 ' : '',
        'inline-flex items-center gap-1 rounded-full border font-semibold italic',
        size,
        verified
          ? 'border-moss-deep bg-moss-wash text-moss-deep'
          : 'border-line-soft bg-paper text-ink-soft',
      ].join(' ')}
    >
      {verified ? 'Verified' : 'Unverified'}
    </span>
  );
}

// BL-x05: shown while no submission photo for the entity has been approved.
function PhotosPendingNotice() {
  return (
    <p
      data-testid="photos-pending"
      className="rounded-[10px] border-[1.5px] border-dashed border-line bg-paper px-3 py-2 text-[11px] font-medium text-ink-soft"
    >
      Photos pending admin approval
    </p>
  );
}

function GymBody({ gym }: { gym: GymDetail }) {
  return (
    <div className="space-y-4">
      {gym.photosPending ? <PhotosPendingNotice /> : null}

      <div data-testid="gym-disciplines">
        <p className="label-caps text-[9.5px] text-ink-faint">
          Disciplines offered
        </p>
        {gym.disciplinesOffered.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-faint">None listed.</p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {gym.disciplinesOffered.map((discipline: GymDiscipline) => (
              <li
                key={discipline}
                data-testid="gym-discipline"
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink"
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
        <p className="label-caps text-[9.5px] text-ink-faint">Hours</p>
        {openNow !== null ? (
          <span
            data-testid="gym-open-now"
            data-open={openNow ? 'true' : 'false'}
            className={[
              'rounded-full border px-2 py-[1px] text-[9px] font-bold uppercase',
              openNow
                ? 'border-moss-deep bg-moss-wash text-moss-deep'
                : 'border-line-soft bg-paper text-ink-soft',
            ].join(' ')}
          >
            {openNow ? 'Open now' : 'Closed now'}
          </span>
        ) : null}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-[11px]">
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
      <p className="mt-1 text-[9.5px] text-ink-faint">
        Shown in the gym&apos;s local time ({timezone}).
      </p>
      {/* AR-51 BL-x08 / §13: hours corrections are handled by email, not an
          in-app form. Verifiers on site use the "something's wrong" path
          during verification instead. */}
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Gym hours correction')}`}
        data-testid="gym-hours-support"
        className="mt-1 block text-[9.5px] text-ink-soft underline decoration-line-soft underline-offset-2"
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
}: {
  routes: MapRouteSummary[];
  scale: GradeScale;
}) {
  if (routes.length === 0) {
    return (
      <p data-testid="crag-no-routes" className="text-xs text-ink-faint">
        No visible routes at this crag.
      </p>
    );
  }

  return (
    <div data-testid="crag-routes" className="space-y-3">
      <p className="label-caps text-[9.5px] text-ink-faint">
        Routes ({routes.length})
      </p>
      {routes.map((route) => (
        <RouteCard key={route.id} route={route} scale={scale} />
      ))}
    </div>
  );
}

function RouteCard({
  route,
  scale,
}: {
  route: MapRouteSummary;
  scale: GradeScale;
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
      className="card space-y-3 p-3"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13.5px] font-bold text-ink">{route.name}</h3>
          {/* BL-x01: the same italicised pill, on each route row. */}
          <StatusPill status={route.status} context="row" />
          <p className="label-caps mt-0.5 text-[9px] text-ink-faint">
            {DISCIPLINE_LABELS[route.discipline]}
          </p>
        </div>
        <span
          data-testid="route-grade"
          data-grade-source={route.grade.source}
          className="shrink-0 rounded-[8px] border-[1.5px] border-line bg-paper px-2 py-1 text-center"
        >
          <span className="block text-[13px] font-bold leading-none text-ink">
            {formatGrade(route.grade.gradeOrdinal, route.discipline, scale)}
          </span>
          <span className="label-caps mt-0.5 block text-[7.5px] text-ink-faint">
            {route.grade.source === 'CONSENSUS' ? 'Consensus' : 'Proposed'}
          </span>
        </span>
      </header>

      {route.photosPending ? <PhotosPendingNotice /> : null}

      <p className="text-[11.5px] leading-relaxed text-ink-soft">{route.summary}</p>

      {route.gearRequirements.length > 0 ? (
        <div data-testid="route-gear">
          <p className="label-caps text-[9px] text-ink-faint">Gear</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {route.gearRequirements.map((item) => (
              <li
                key={item}
                data-testid="gear-chip"
                data-gear={item}
                className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink"
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
          className="flex gap-4 text-[11px] text-ink-soft"
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
        <div className="flex items-center justify-between text-[10px] text-ink-soft">
          <span className="label-caps text-[9px] text-ink-faint">
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
