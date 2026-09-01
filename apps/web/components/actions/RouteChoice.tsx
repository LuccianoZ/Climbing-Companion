'use client';

import { formatGrade, type GradeScale } from '@/lib/grades';
import { DISCIPLINE_LABELS, type MapRouteSummary } from '@/lib/types';

// Shared by all three route-targeted actions (verify, vote, log). AR-25: the
// detail panel is per *crag*, but every one of those endpoints is per
// *route* -- /api/routes/:routeId/... -- so something has to answer "which
// line are you standing under?" before any of them can fire.
//
// One route is the common case at a new crag, so it selects itself and
// renders as a statement rather than a control: making someone tick the only
// box is friction with no decision behind it.

export function RouteChoice({
  routes,
  selectedId,
  onSelect,
  scale,
  // Verification is unavailable once a route is VERIFIED (the server answers
  // 409, and AR-25 hides the button), so that action passes a predicate
  // rather than having this component hard-code a rule the other two do not
  // share -- voting and logging are deliberately not gated on lifecycle
  // status (AR-18).
  isDisabled,
  disabledHint,
  emptyHint,
}: {
  routes: MapRouteSummary[];
  selectedId: string | null;
  onSelect: (routeId: string) => void;
  scale: GradeScale;
  isDisabled?: (route: MapRouteSummary) => boolean;
  disabledHint?: string;
  emptyHint?: string;
}) {
  const selectable = routes.filter((route) => !isDisabled?.(route));

  if (selectable.length === 0) {
    return (
      <p
        data-testid="route-choice-empty"
        className="rounded-[10px] border-[1.5px] border-line-soft bg-paper px-3 py-2.5 text-[11.5px] leading-snug text-ink-soft"
      >
        {emptyHint ?? 'There is no route here you can do this to.'}
      </p>
    );
  }

  if (selectable.length === 1) {
    const only = selectable[0];
    return (
      <div
        data-testid="route-choice-single"
        data-route-id={only.id}
        className="rounded-[10px] border-[1.5px] border-line bg-paper px-3 py-2.5"
      >
        <p className="label-caps text-[9px] text-ink-faint">Route</p>
        <p className="text-[13px] font-bold text-ink">{only.name}</p>
        <p className="text-[10.5px] text-ink-soft">
          {DISCIPLINE_LABELS[only.discipline]} ·{' '}
          {formatGrade(only.grade.gradeOrdinal, only.discipline, scale)}
        </p>
      </div>
    );
  }

  return (
    <fieldset data-testid="route-choice" className="space-y-2">
      <legend className="label-caps text-[9.5px] text-ink-faint">
        Which route?
      </legend>
      <div className="space-y-1.5">
        {routes.map((route) => {
          const disabled = isDisabled?.(route) ?? false;
          const checked = route.id === selectedId;
          return (
            <label
              key={route.id}
              data-testid="route-choice-option"
              data-route-id={route.id}
              data-disabled={disabled ? 'true' : 'false'}
              className={[
                'flex items-start gap-2.5 rounded-[10px] border-[1.5px] px-3 py-2.5',
                disabled
                  ? 'cursor-not-allowed border-line-soft bg-paper opacity-60'
                  : checked
                    ? 'cursor-pointer border-ink bg-paper'
                    : 'cursor-pointer border-line-soft bg-surface',
              ].join(' ')}
            >
              <input
                type="radio"
                name="routeId"
                value={route.id}
                checked={checked}
                disabled={disabled}
                onChange={() => onSelect(route.id)}
                className="mt-0.5 h-3.5 w-3.5 accent-[color:var(--color-clay-deep)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold text-ink">
                  {route.name}
                </span>
                <span className="block text-[10.5px] text-ink-soft">
                  {DISCIPLINE_LABELS[route.discipline]} ·{' '}
                  {formatGrade(route.grade.gradeOrdinal, route.discipline, scale)}
                  {disabled && disabledHint ? ` · ${disabledHint}` : ''}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// The route an action should start on: the first one it is allowed to act on.
// Computed by the caller during render rather than assigned in an effect, for
// the same React 19 reason AR-27 and AR-32 both work around.
export function defaultRouteId(
  routes: MapRouteSummary[],
  isDisabled?: (route: MapRouteSummary) => boolean,
): string | null {
  const first = routes.find((route) => !isDisabled?.(route));
  return first?.id ?? null;
}
