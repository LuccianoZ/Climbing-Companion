'use client';

import { useEffect, useState } from 'react';
import { CloseIcon } from '@/components/shell/icons';
import { formatGrade, type GradeScale } from '@/lib/grades';
import { distanceMeters, formatDistance, isWithinProximity } from '@/lib/geo';
import {
  DISCIPLINE_LABELS,
  GYM_DISCIPLINE_LABELS,
  type GymDiscipline,
  type MapRouteSummary,
  type PinDetail,
} from '@/lib/types';
import { GradeScaleToggle } from './GradeScaleToggle';
import { InRangeActions } from './InRangeActions';
import { VoteDistribution } from './VoteDistribution';

// BL-021. A bottom sheet rather than a popup anchored to the pin: the panel
// carries a route list, a distribution chart and four action buttons, which
// a Leaflet popup on a 390px-wide phone cannot hold without covering the
// pin it describes.

export type DetailSheetState =
  | { status: 'loading'; name: string }
  | { status: 'error'; name: string }
  | { status: 'ready'; detail: PinDetail };

export function DetailSheet({
  state,
  viewer,
  onClose,
}: {
  state: DetailSheetState;
  viewer: { latitude: number; longitude: number } | null;
  onClose: () => void;
}) {
  // Scale lives at sheet level, not per route: a climber comparing routes at
  // one crag reads them all in the same scale (AR-20).
  const [scale, setScale] = useState<GradeScale>('YOSEMITE');

  // Escape closes the sheet. The map underneath keeps keyboard focus
  // behaviour of its own, so this is registered on the document rather than
  // relying on focus being inside the panel.
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
            <h2 className="label-caps truncate text-[15px] text-ink">
              {state.status === 'ready' ? state.detail.name : state.name}
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              {distance !== null
                ? `Distance: ${formatDistance(distance)}`
                : viewer === null
                  ? 'Location unavailable'
                  : '—'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {detail?.kind === 'CRAG' ? (
              <GradeScaleToggle scale={scale} onChange={setScale} />
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
            <StatusBadge status={detail.status} />
            <InRangeActions inRange={inRange} />

            {detail.kind === 'GYM' ? (
              <GymBody disciplines={detail.disciplinesOffered} />
            ) : (
              <CragBody routes={detail.routes} scale={scale} />
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

// BL-020's badge, restated inside the panel: a climber who opened an
// unverified pin should not have to remember the map's pin colour to know
// what they are looking at.
function StatusBadge({ status }: { status: PinDetail['status'] }) {
  if (status === 'VERIFIED') {
    return (
      <span
        data-testid="detail-status-verified"
        className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-line bg-moss-wash px-2.5 py-1 text-[10.5px] font-semibold text-moss-deep"
      >
        Verified by Community
      </span>
    );
  }
  return (
    <span
      data-testid="detail-status-unverified"
      className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-line-soft bg-paper px-2.5 py-1 text-[10.5px] font-semibold text-ink-soft"
    >
      Unverified by Community
    </span>
  );
}

// Foundation §4: a gym is a standalone pin with no child routes and no
// grade, so its panel shows the disciplines its verifiers reported.
function GymBody({ disciplines }: { disciplines: GymDiscipline[] }) {
  return (
    <div data-testid="gym-disciplines">
      <p className="label-caps text-[9.5px] text-ink-faint">Disciplines offered</p>
      {disciplines.length === 0 ? (
        <p className="mt-1.5 text-xs text-ink-faint">
          None reported yet — disciplines are filled in by the gym&apos;s
          fourth verification.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {disciplines.map((discipline) => (
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
  );
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
      className="card space-y-3 p-3"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13.5px] font-bold text-ink">{route.name}</h3>
          <p className="label-caps text-[9px] text-ink-faint">
            {DISCIPLINE_LABELS[route.discipline]}
          </p>
        </div>
        {/* BL-016: "Proposed Grade: X" until 4 votes exist, plurality
            consensus afterwards. The source is surfaced, not hidden --
            a climber deciding whether to trust a grade needs to know
            whether one person guessed it or twelve agreed on it. */}
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

      <p className="text-[11.5px] leading-relaxed text-ink-soft">{route.summary}</p>

      {/* BL-023 (gear-requirement icons) is intentionally not rendered:
          its icon artwork does not exist yet, and placeholder glyphs would
          have to be replaced rather than extended. The API already returns
          `gearRequirements`, so that story is a rendering change only. */}

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
