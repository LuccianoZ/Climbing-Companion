import { formatGrade, type GradeScale } from '@/lib/grades';
import type { GradeConsensus, OutdoorDiscipline } from '@/lib/types';

// BL-021's "vote distribution" field, and the visible half of BL-016's
// consensus rule. Bars are proportional to the winning count rather than
// the total, so a 3-vs-2 split reads as a near-tie instead of two short
// stubs -- which is the actual information a climber wants ("is this grade
// agreed on, or contested?").
//
// Rendered even for a Visitor: the consensus read is deliberately
// unauthenticated on the API side, and hiding the distribution behind a
// login here would quietly undo that.
export function VoteDistribution({
  grade,
  discipline,
  scale,
}: {
  grade: GradeConsensus;
  discipline: OutdoorDiscipline;
  scale: GradeScale;
}) {
  if (grade.distribution.length === 0) {
    return (
      <p data-testid="vote-distribution-empty" className="text-xs text-ink-faint">
        No grade votes yet — showing the submitter&apos;s proposed grade.
      </p>
    );
  }

  const peak = Math.max(...grade.distribution.map((d) => d.voteCount));

  return (
    <div data-testid="vote-distribution" className="space-y-1.5">
      <p className="label-caps text-[9.5px] text-ink-faint">
        Community grade consensus
      </p>
      {grade.distribution.map((entry) => (
        <div
          key={entry.gradeOrdinal}
          data-testid="vote-distribution-row"
          data-grade-ordinal={entry.gradeOrdinal}
          className="flex items-center gap-2"
        >
          <span className="w-11 shrink-0 text-[11px] font-semibold text-ink">
            {formatGrade(entry.gradeOrdinal, discipline, scale)}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
            <span
              className="block h-full rounded-full bg-clay"
              style={{ width: `${Math.max(6, (entry.voteCount / peak) * 100)}%` }}
            />
          </span>
          <span className="w-5 shrink-0 text-right text-[11px] text-ink-soft">
            {entry.voteCount}
          </span>
        </div>
      ))}
    </div>
  );
}
