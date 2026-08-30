import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { GradeVoteService } from './grade-vote.service';
import { Route, OutdoorDiscipline } from '../routes/entities/route.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import type { VoteOnGradeDto } from './dto/vote-on-grade.dto';

describe('GradeVoteService', () => {
  let routeRepo: { findOne: ReturnType<typeof vi.fn> };
  let insertQb: Record<string, ReturnType<typeof vi.fn>>;
  let manager: {
    getRepository: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let dataSource: {
    transaction: ReturnType<typeof vi.fn>;
    getRepository: ReturnType<typeof vi.fn>;
    manager: unknown;
  };
  let service: GradeVoteService;

  const routeId = 'route-1';
  const voterId = 'voter-1';
  const location = { latitude: 42.91, longitude: -78.87 };
  const dto: VoteOnGradeDto = { gradeOrdinal: 10 };

  function baseRoute(overrides: Partial<Route> = {}): Route {
    return {
      id: routeId,
      cragId: 'crag-1',
      name: 'Sunny Slab',
      location: { type: 'Point', coordinates: [-78.87, 42.91] },
      discipline: OutdoorDiscipline.SPORT_CLIMBING,
      gearRequirements: [],
      summary: 'A route seeded for grade-consensus tests.',
      proposedGradeOrdinal: 9,
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

  beforeEach(() => {
    routeRepo = { findOne: vi.fn() };
    insertQb = {};
    insertQb.insert = vi.fn().mockReturnValue(insertQb);
    insertQb.into = vi.fn().mockReturnValue(insertQb);
    insertQb.values = vi.fn().mockReturnValue(insertQb);
    insertQb.orUpdate = vi.fn().mockReturnValue(insertQb);
    insertQb.execute = vi.fn().mockResolvedValue({});

    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Route) return routeRepo;
        throw new Error('unexpected repository requested');
      }),
      query: vi.fn(),
      createQueryBuilder: vi.fn().mockReturnValue(insertQb),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Route) return routeRepo;
        throw new Error('unexpected repository requested');
      }),
      manager,
    };
    service = new GradeVoteService(dataSource as unknown as DataSource);
  });

  describe('voteOnGrade', () => {
    it('throws NotFoundException when the route does not exist', async () => {
      routeRepo.findOne.mockResolvedValue(undefined);
      await expect(
        service.voteOnGrade(routeId, voterId, dto, location),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the voter is outside 300m', async () => {
      routeRepo.findOne.mockResolvedValue(baseRoute());
      manager.query.mockResolvedValueOnce([{ within: false }]);
      await expect(
        service.voteOnGrade(routeId, voterId, dto, location),
      ).rejects.toThrow(ForbiddenException);
      expect(insertQb.execute).not.toHaveBeenCalled();
    });

    it('upserts the vote and returns PROPOSED when fewer than 4 votes exist', async () => {
      routeRepo.findOne.mockResolvedValue(baseRoute());
      manager.query
        .mockResolvedValueOnce([{ within: true }])
        .mockResolvedValueOnce([{ grade_ordinal: 10, vote_count: '1' }]);

      const result = await service.voteOnGrade(routeId, voterId, dto, location);

      expect(insertQb.orUpdate).toHaveBeenCalledWith(
        ['grade_ordinal'],
        ['route_id', 'voter_user_id'],
      );
      expect(result.source).toBe('PROPOSED');
      expect(result.gradeOrdinal).toBe(9);
      expect(result.totalVotes).toBe(1);
    });

    it('returns CONSENSUS once 4 votes exist, using the plurality winner', async () => {
      routeRepo.findOne.mockResolvedValue(baseRoute());
      manager.query
        .mockResolvedValueOnce([{ within: true }])
        .mockResolvedValueOnce([
          { grade_ordinal: 10, vote_count: '3' },
          { grade_ordinal: 9, vote_count: '1' },
        ]);

      const result = await service.voteOnGrade(routeId, voterId, dto, location);

      expect(result.source).toBe('CONSENSUS');
      expect(result.gradeOrdinal).toBe(10);
      expect(result.totalVotes).toBe(4);
      expect(result.distribution).toEqual([
        { gradeOrdinal: 10, voteCount: 3 },
        { gradeOrdinal: 9, voteCount: 1 },
      ]);
    });
  });

  describe('getGradeConsensus', () => {
    it('throws NotFoundException when the route does not exist', async () => {
      routeRepo.findOne.mockResolvedValue(undefined);
      await expect(service.getGradeConsensus(routeId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns PROPOSED with zero votes cast', async () => {
      routeRepo.findOne.mockResolvedValue(
        baseRoute({ proposedGradeOrdinal: 6 }),
      );
      manager.query.mockResolvedValueOnce([]);

      const result = await service.getGradeConsensus(routeId);

      expect(result.source).toBe('PROPOSED');
      expect(result.gradeOrdinal).toBe(6);
      expect(result.totalVotes).toBe(0);
    });

    it('resolves a tie to the lower grade ordinal (relies on the query already sorting grade_ordinal ASC on ties)', async () => {
      routeRepo.findOne.mockResolvedValue(baseRoute());
      manager.query.mockResolvedValueOnce([
        { grade_ordinal: 9, vote_count: '2' },
        { grade_ordinal: 12, vote_count: '2' },
      ]);

      const result = await service.getGradeConsensus(routeId);

      expect(result.source).toBe('CONSENSUS');
      expect(result.gradeOrdinal).toBe(9);
      expect(result.totalVotes).toBe(4);
    });
  });
});
