import type { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { OutdoorDiscipline } from '../routes/entities/route.entity';
import { ClimbOutcome } from '../climb-logs/entities/climb-log.entity';

describe('AnalyticsService', () => {
  const userId = 'user-1';
  let dataSource: { query: ReturnType<typeof vi.fn> };
  let service: AnalyticsService;

  beforeEach(() => {
    dataSource = { query: vi.fn() };
    service = new AnalyticsService(dataSource as unknown as DataSource);
  });

  it('returns a zeroed bucket per discipline when there are no logs', async () => {
    dataSource.query.mockResolvedValue([]);

    const result = await service.getOutdoorAnalytics(userId);

    expect(Object.keys(result)).toEqual([
      OutdoorDiscipline.SPORT_CLIMBING,
      OutdoorDiscipline.BOULDERING,
      OutdoorDiscipline.TRADITIONAL_CLIMBING,
    ]);
    for (const discipline of Object.values(result)) {
      expect(discipline).toEqual({
        completed: 0,
        attempted: 0,
        completionRate: 0,
        gradeDistribution: [],
      });
    }
  });

  it('splits completed climbs by discipline', async () => {
    dataSource.query.mockResolvedValue([
      {
        discipline: OutdoorDiscipline.SPORT_CLIMBING,
        outcome: ClimbOutcome.COMPLETED,
        grade_ordinal: 10,
        count: 3,
      },
      {
        discipline: OutdoorDiscipline.BOULDERING,
        outcome: ClimbOutcome.COMPLETED,
        grade_ordinal: 4,
        count: 2,
      },
    ]);

    const result = await service.getOutdoorAnalytics(userId);

    expect(result[OutdoorDiscipline.SPORT_CLIMBING].completed).toBe(3);
    expect(result[OutdoorDiscipline.BOULDERING].completed).toBe(2);
    expect(result[OutdoorDiscipline.TRADITIONAL_CLIMBING].completed).toBe(0);
  });

  it('renders attempts as a separate series alongside completions, per grade point', async () => {
    dataSource.query.mockResolvedValue([
      {
        discipline: OutdoorDiscipline.SPORT_CLIMBING,
        outcome: ClimbOutcome.COMPLETED,
        grade_ordinal: 10,
        count: 2,
      },
      {
        discipline: OutdoorDiscipline.SPORT_CLIMBING,
        outcome: ClimbOutcome.ATTEMPTED,
        grade_ordinal: 10,
        count: 5,
      },
    ]);

    const result = await service.getOutdoorAnalytics(userId);
    const sport = result[OutdoorDiscipline.SPORT_CLIMBING];

    expect(sport.completed).toBe(2);
    expect(sport.attempted).toBe(5);
    expect(sport.gradeDistribution).toEqual([
      { gradeOrdinal: 10, completed: 2, attempted: 5 },
    ]);
  });

  it('computes completion rate as completed / (completed + attempted)', async () => {
    dataSource.query.mockResolvedValue([
      {
        discipline: OutdoorDiscipline.TRADITIONAL_CLIMBING,
        outcome: ClimbOutcome.COMPLETED,
        grade_ordinal: 8,
        count: 3,
      },
      {
        discipline: OutdoorDiscipline.TRADITIONAL_CLIMBING,
        outcome: ClimbOutcome.ATTEMPTED,
        grade_ordinal: 8,
        count: 1,
      },
    ]);

    const result = await service.getOutdoorAnalytics(userId);
    expect(result[OutdoorDiscipline.TRADITIONAL_CLIMBING].completionRate).toBe(
      0.75,
    );
  });

  it('sorts the grade distribution by grade ordinal ascending', async () => {
    dataSource.query.mockResolvedValue([
      {
        discipline: OutdoorDiscipline.BOULDERING,
        outcome: ClimbOutcome.COMPLETED,
        grade_ordinal: 5,
        count: 1,
      },
      {
        discipline: OutdoorDiscipline.BOULDERING,
        outcome: ClimbOutcome.COMPLETED,
        grade_ordinal: 2,
        count: 1,
      },
    ]);

    const result = await service.getOutdoorAnalytics(userId);
    expect(
      result[OutdoorDiscipline.BOULDERING].gradeDistribution.map(
        (p) => p.gradeOrdinal,
      ),
    ).toEqual([2, 5]);
  });
});
