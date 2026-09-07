import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OutdoorDiscipline } from '../routes/entities/route.entity';
import { ClimbOutcome } from '../climb-logs/entities/climb-log.entity';

export interface GradeDistributionPoint {
  gradeOrdinal: number;
  completed: number;
  attempted: number;
}

export interface DisciplineAnalytics {
  completed: number;
  attempted: number;
  // completed / (completed + attempted); 0 when there are no logs at all,
  // never NaN.
  completionRate: number;
  gradeDistribution: GradeDistributionPoint[];
}

export type OutdoorAnalytics = Record<OutdoorDiscipline, DisciplineAnalytics>;

const DISCIPLINES: OutdoorDiscipline[] = [
  OutdoorDiscipline.SPORT_CLIMBING,
  OutdoorDiscipline.BOULDERING,
  OutdoorDiscipline.TRADITIONAL_CLIMBING,
];

function freshBucket(): DisciplineAnalytics {
  return {
    completed: 0,
    attempted: 0,
    completionRate: 0,
    gradeDistribution: [],
  };
}

interface AggregateRow {
  discipline: OutdoorDiscipline;
  outcome: ClimbOutcome;
  grade_ordinal: number;
  count: number;
}

// Foundation §12 "Analytics -- Outdoor" (RESOLVED Sprint 0, Aug 24), BL-036/037.
// Lifetime completed climbs split Sport/Bouldering/Trad, attempts as a
// separate series alongside completions (both plotted per grade ordinal so
// the frontend can render one grouped chart), plus a completion rate
// (completed / total logs) per discipline. Reads `climb_logs` only --
// nothing here writes to it (ClimbLogsService.logClimb is the sole writer,
// AR-18).
@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  async getOutdoorAnalytics(userId: string): Promise<OutdoorAnalytics> {
    const rows: AggregateRow[] = await this.dataSource.query(
      `SELECT r.discipline AS discipline,
              cl.outcome AS outcome,
              cl.grade_snapshot_ordinal AS grade_ordinal,
              COUNT(*)::int AS count
         FROM climb_logs cl
         JOIN routes r ON r.id = cl.route_id
        WHERE cl.user_id = $1
        GROUP BY r.discipline, cl.outcome, cl.grade_snapshot_ordinal`,
      [userId],
    );

    const disciplines = Object.fromEntries(
      DISCIPLINES.map((d) => [d, freshBucket()]),
    ) as OutdoorAnalytics;
    const gradePoints: Record<
      OutdoorDiscipline,
      Map<number, GradeDistributionPoint>
    > = Object.fromEntries(DISCIPLINES.map((d) => [d, new Map()])) as Record<
      OutdoorDiscipline,
      Map<number, GradeDistributionPoint>
    >;

    for (const row of rows) {
      const bucket = disciplines[row.discipline];
      const points = gradePoints[row.discipline];
      const gradeOrdinal = Number(row.grade_ordinal);
      const count = Number(row.count);

      if (!points.has(gradeOrdinal)) {
        points.set(gradeOrdinal, { gradeOrdinal, completed: 0, attempted: 0 });
      }
      const point = points.get(gradeOrdinal)!;

      if (row.outcome === ClimbOutcome.COMPLETED) {
        bucket.completed += count;
        point.completed += count;
      } else {
        bucket.attempted += count;
        point.attempted += count;
      }
    }

    for (const discipline of DISCIPLINES) {
      const bucket = disciplines[discipline];
      const total = bucket.completed + bucket.attempted;
      bucket.completionRate = total > 0 ? bucket.completed / total : 0;
      bucket.gradeDistribution = Array.from(
        gradePoints[discipline].values(),
      ).sort((a, b) => a.gradeOrdinal - b.gradeOrdinal);
    }

    return disciplines;
  }
}
