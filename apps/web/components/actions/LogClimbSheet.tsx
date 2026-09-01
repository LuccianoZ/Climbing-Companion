'use client';

import { useState, type FormEvent } from 'react';
import {
  ActionError,
  ActionSheet,
  ActionSubmit,
  ActionSuccess,
} from '@/components/ui/ActionSheet';
import { logClimb } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { formatGrade, type GradeScale } from '@/lib/grades';
import type {
  ClimbLogResult,
  ClimbOutcome,
  CragDetail,
} from '@/lib/types';
import { RouteChoice, defaultRouteId } from './RouteChoice';

// BL-017 / BL-018. One sheet, not two: Foundation section 7 and BL-017's card
// both describe "two actions, identical mechanics, only outcome differs", and
// LogClimbDto models it as a single endpoint taking a ClimbOutcome. Splitting
// it into "Log as Completed" and "Log as Attempted" buttons on the map would
// mean two entry points to the same request.
//
// Logging works on a route in any lifecycle status, including UNVERIFIED
// (AR-18) -- neither Foundation nor climb-logging.feature gates it on
// anything but the 300m radius.

const OUTCOMES: { value: ClimbOutcome; label: string }[] = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ATTEMPTED', label: 'Attempted' },
];

export function LogClimbSheet({
  crag,
  viewer,
  scale,
  onClose,
  onCompleted,
}: {
  crag: CragDetail;
  viewer: { latitude: number; longitude: number };
  scale: GradeScale;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [chosenRouteId, setChosenRouteId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ClimbOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ClimbLogResult | null>(null);

  const routeId = chosenRouteId ?? defaultRouteId(crag.routes);
  const route = crag.routes.find((entry) => entry.id === routeId) ?? null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!route || !outcome) {
      return;
    }

    setPending(true);
    try {
      const logged = await logClimb(route.id, {
        outcome,
        latitude: viewer.latitude,
        longitude: viewer.longitude,
      });
      setResult(logged);
      onCompleted();
    } catch (submitError) {
      setError(messageFor('LOG_CLIMB', submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <ActionSheet
      title="Log climb"
      subtitle={route ? `Route: ${route.name}` : crag.name}
      testId="log-climb-sheet"
      onClose={onClose}
    >
      {result && route ? (
        <div className="space-y-3">
          <ActionSuccess
            message={`Logged as ${result.outcome === 'COMPLETED' ? 'completed' : 'attempted'} at ${formatGrade(result.gradeSnapshotOrdinal, route.discipline, scale)}.`}
          />
          <p className="rounded-[10px] border-[1.5px] border-line bg-paper px-3 py-2.5 text-[11.5px] leading-snug text-ink-soft">
            That grade is a snapshot taken just now. If the community regrades
            this route later, your logbook keeps the grade it was when you
            climbed it.
          </p>
          <button
            type="button"
            data-testid="log-done"
            onClick={onClose}
            className="w-full rounded-[10px] border-[1.5px] border-ink bg-ink px-4 py-3 text-[13px] font-bold text-paper"
          >
            Done
          </button>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-4">
          <RouteChoice
            routes={crag.routes}
            selectedId={routeId}
            onSelect={setChosenRouteId}
            scale={scale}
            emptyHint="There are no visible routes at this crag to log."
          />

          {route ? (
            <>
              <div
                data-testid="grade-snapshot"
                className="flex items-center gap-3 rounded-[10px] border-[1.5px] border-line bg-paper px-3 py-2.5"
              >
                <span className="rounded-[8px] border-[1.5px] border-line bg-surface px-2.5 py-1.5 text-[14px] font-bold text-ink">
                  {formatGrade(
                    route.grade.gradeOrdinal,
                    route.discipline,
                    scale,
                  )}
                </span>
                <span className="text-[11.5px] leading-snug text-ink-soft">
                  {route.grade.source === 'CONSENSUS'
                    ? 'Consensus grade snapshot'
                    : 'Proposed grade snapshot'}{' '}
                  — recorded with your log.
                </span>
              </div>

              <fieldset data-testid="outcome-choice" className="space-y-2">
                <legend className="label-caps text-[9.5px] text-ink-faint">
                  Outcome *
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {OUTCOMES.map((option) => {
                    const active = outcome === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        data-testid={`outcome-${option.value}`}
                        onClick={() => setOutcome(option.value)}
                        className={[
                          'label-caps rounded-[10px] border-[1.5px] px-3 py-3 text-[11px]',
                          active
                            ? 'border-clay-deep bg-clay text-ink'
                            : 'border-line bg-surface text-ink-soft',
                        ].join(' ')}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* AR-30. The approved mockup shows a "Notes (Optional)" field
                  here and there is deliberately none. climb_logs has no note
                  column, LogClimbDto has no such field, and the API's
                  ValidationPipe runs forbidNonWhitelisted -- so sending one
                  would be a 400, and adding one means a migration Sprint 3
                  explicitly declined. Said out loud rather than left as a
                  silent omission, so this does not read as a bug in review. */}
              <p
                data-testid="notes-not-stored"
                className="rounded-[10px] border-[1.5px] border-dashed border-line-soft px-3 py-2.5 text-[10.5px] leading-snug text-ink-faint"
              >
                Climb notes aren&apos;t stored — a log is the route, the
                outcome and the grade at the time, nothing else.
              </p>

              <ActionError message={error} />

              <ActionSubmit
                testId="log-climb-submit"
                tone="clay"
                label="Save log"
                pendingLabel="Saving…"
                pending={pending}
                disabled={!outcome}
              />
            </>
          ) : null}
        </form>
      )}
    </ActionSheet>
  );
}
