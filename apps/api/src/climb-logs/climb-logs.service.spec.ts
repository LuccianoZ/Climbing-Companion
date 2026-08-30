import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ClimbLogsService } from './climb-logs.service';
import { ClimbLog, ClimbOutcome } from './entities/climb-log.entity';
import { Route, OutdoorDiscipline } from '../routes/entities/route.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import type {
  GradeVoteService,
  GradeConsensusResult,
} from '../grade-votes/grade-vote.service';
import type { LogClimbDto } from './dto/log-climb.dto';

describe('ClimbLogsService', () => {
  let routeRepo: { findOne: ReturnType<typeof vi.fn> };
  let logRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: {
    getRepository: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let gradeVoteService: { computeConsensus: ReturnType<typeof vi.fn> };
  let service: ClimbLogsService;

  const routeId = 'route-1';
  const userId = 'user-1';
  const location = { latitude: 42.92, longitude: -78.89 };

  function baseRoute(overrides: Partial<Route> = {}): Route {
    return {
      id: routeId,
      cragId: 'crag-1',
      name: 'Practice Wall',
      location: { type: 'Point', coordinates: [-78.89, 42.92] },
      discipline: OutdoorDiscipline.SPORT_CLIMBING,
      gearRequirements: [],
      summary: 'A route seeded for climb-logging tests.',
      proposedGradeOrdinal: 7,
      boltCount: null,
      minRopeLengthM: null,
      status: LifecycleStatus.UNVERIFIED,
      submittedBy: 'submitter-1',
      verifiedAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function consensusResult(
    overrides: Partial<GradeConsensusResult> = {},
  ): GradeConsensusResult {
    return {
      source: 'PROPOSED',
      gradeOrdinal: 7,
      totalVotes: 0,
      distribution: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    routeRepo = { findOne: vi.fn() };
    logRepo = {
      create: vi.fn((data: Partial<ClimbLog>) => ({ ...data }) as ClimbLog),
      save: vi.fn((log: ClimbLog) => ({
        ...log,
        id: 'log-1',
        loggedAt: new Date(),
      })),
    };
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Route) return routeRepo;
        if (entity === ClimbLog) return logRepo;
        throw new Error('unexpected repository requested');
      }),
      query: vi.fn(),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    gradeVoteService = {
      computeConsensus: vi.fn().mockResolvedValue(consensusResult()),
    };
    service = new ClimbLogsService(
      dataSource as unknown as DataSource,
      gradeVoteService as unknown as GradeVoteService,
    );
  });

  const dto: LogClimbDto = { outcome: ClimbOutcome.COMPLETED };

  it('throws NotFoundException when the route does not exist', async () => {
    routeRepo.findOne.mockResolvedValue(undefined);
    await expect(
      service.logClimb(routeId, userId, dto, location),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when the climber is outside 300m', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    manager.query.mockResolvedValueOnce([{ within: false }]);
    await expect(
      service.logClimb(routeId, userId, dto, location),
    ).rejects.toThrow(ForbiddenException);
    expect(gradeVoteService.computeConsensus).not.toHaveBeenCalled();
    expect(logRepo.save).not.toHaveBeenCalled();
  });

  it('writes a climb_logs row snapshotting the current consensus grade for COMPLETED', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    manager.query.mockResolvedValueOnce([{ within: true }]);
    gradeVoteService.computeConsensus.mockResolvedValue(
      consensusResult({ gradeOrdinal: 7 }),
    );

    const result = await service.logClimb(routeId, userId, dto, location);

    expect(gradeVoteService.computeConsensus).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ id: routeId }),
    );
    expect(logRepo.create).toHaveBeenCalledWith({
      routeId,
      userId,
      outcome: ClimbOutcome.COMPLETED,
      gradeSnapshotOrdinal: 7,
    });
    expect(result.gradeSnapshotOrdinal).toBe(7);
    expect(result.outcome).toBe(ClimbOutcome.COMPLETED);
  });

  it('writes a climb_logs row for ATTEMPTED using whatever the live consensus is at that moment', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    manager.query.mockResolvedValueOnce([{ within: true }]);
    gradeVoteService.computeConsensus.mockResolvedValue(
      consensusResult({ source: 'CONSENSUS', gradeOrdinal: 11, totalVotes: 4 }),
    );

    const result = await service.logClimb(
      routeId,
      userId,
      { outcome: ClimbOutcome.ATTEMPTED },
      location,
    );

    expect(logRepo.create).toHaveBeenCalledWith({
      routeId,
      userId,
      outcome: ClimbOutcome.ATTEMPTED,
      gradeSnapshotOrdinal: 11,
    });
    expect(result.gradeSnapshotOrdinal).toBe(11);
  });

  it('allows repeat logging with no uniqueness check -- each call independently inserts', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    manager.query.mockResolvedValue([{ within: true }]);

    await service.logClimb(routeId, userId, dto, location);
    await service.logClimb(routeId, userId, dto, location);

    expect(logRepo.save).toHaveBeenCalledTimes(2);
  });
});
