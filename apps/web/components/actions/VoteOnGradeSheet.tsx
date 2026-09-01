'use client';

import { useState, type FormEvent } from 'react';
import { VoteDistribution } from '@/components/map/VoteDistribution';
import {
  ActionError,
  ActionSheet,
  ActionSubmit,
  ActionSuccess,
} from '@/components/ui/ActionSheet';
import { voteOnGrade } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import { formatGrade, gradeOptions, type GradeScale } from '@/lib/grades';
import type { CragDetail, GradeConsensus } from '@/lib/types';
import { RouteChoice, defaultRouteId } from './RouteChoice';

// BL-015 / BL-016. Deliberately available on any route in range, at any time:
// Foundation section 6 describes a standalone vote action "appearing" once
// four verification-sourced votes exist, but AR-18 reads that as a frontend
// affordance rather than a backend precondition -- GradeVoteService accepts a
// vote from any climber within 300m, and there is no column that could tell a
// standalone vote from a verification-sourced one afterwards.
//
// Re-voting is not an error. The write is an upsert on
// (route_id, voter_user_id), which is exactly Foundation section 6's "change
// your vote on a return visit" -- so this sheet never warns about voting
// twice, and the response is the freshly recomputed consensus either way.

export function VoteOnGradeSheet({
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
  const [gradeOrdinal, setGradeOrdinal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<GradeConsensus | null>(null);

  const routeId = chosenRouteId ?? defaultRouteId(crag.routes);
  const route = crag.routes.find((entry) => entry.id === routeId) ?? null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!route || gradeOrdinal === null) {
      return;
    }

    setPending(true);
    try {
      const consensus = await voteOnGrade(route.id, {
        gradeOrdinal,
        latitude: viewer.latitude,
        longitude: viewer.longitude,
      });
      setResult(consensus);
      onCompleted();
    } catch (submitError) {
      setError(messageFor('VOTE', submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <ActionSheet
      title="Vote on grade"
      subtitle={crag.name}
      testId="vote-grade-sheet"
      onClose={onClose}
    >
      {result && route ? (
        <div className="space-y-3">
          <ActionSuccess
            message={
              result.source === 'CONSENSUS'
                ? `Vote counted. ${route.name} now sits at a community consensus of ${formatGrade(result.gradeOrdinal, route.discipline, scale)}.`
                : `Vote counted. ${route.name} still shows its proposed grade until four climbers have voted.`
            }
          />
          <div className="card p-3">
            <VoteDistribution
              grade={result}
              discipline={route.discipline}
              scale={scale}
            />
          </div>
          <button
            type="button"
            data-testid="vote-done"
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
            emptyHint="There are no visible routes at this crag to grade."
          />

          {route ? (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="voteGradeOrdinal"
                  className="label-caps block text-[9.5px] text-ink-faint"
                >
                  How hard did it feel? *
                </label>
                <select
                  id="voteGradeOrdinal"
                  data-testid="vote-grade-select"
                  value={gradeOrdinal ?? ''}
                  onChange={(event) =>
                    setGradeOrdinal(
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                    )
                  }
                  className="w-full rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none"
                >
                  <option value="">Select grade</option>
                  {gradeOptions(route.discipline, scale).map((option) => (
                    <option key={option.ordinal} value={option.ordinal}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10.5px] leading-snug text-ink-faint">
                  If you have voted on this route before, this replaces your
                  earlier vote rather than adding a second one.
                </p>
              </div>

              <div className="card p-3">
                <VoteDistribution
                  grade={route.grade}
                  discipline={route.discipline}
                  scale={scale}
                />
              </div>

              <ActionError message={error} />

              <ActionSubmit
                testId="vote-grade-submit"
                label="Submit vote"
                pendingLabel="Submitting…"
                pending={pending}
                disabled={gradeOrdinal === null}
              />
            </>
          ) : null}
        </form>
      )}
    </ActionSheet>
  );
}
