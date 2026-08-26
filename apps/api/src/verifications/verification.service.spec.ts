import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { VerificationService } from './verification.service';
import { Route, OutdoorDiscipline } from '../routes/entities/route.entity';
import { Crag } from '../crags/entities/crag.entity';
import { RouteVerification } from './entities/route-verification.entity';
import { RouteGradeVote } from './entities/route-grade-vote.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import type { SubmitRouteVerificationDto } from './dto/submit-route-verification.dto';

function uniqueViolation(): Error & { code: string } {
  const err = new Error(
    'duplicate key value violates unique constraint',
  ) as Error & { code: string };
  err.code = '23505';
  return err;
}

describe('VerificationService.submitRouteVerification', () => {
  let routeRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let verificationRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let cragRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let insertQb: Record<string, ReturnType<typeof vi.fn>>;
  let manager: {
    getRepository: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let service: VerificationService;

  const routeId = 'route-1';
  const verifierId = 'verifier-1';
  const submitterId = 'submitter-1';
  const dto: SubmitRouteVerificationDto = {
    mediaAssetId: 'media-1',
    gradeOrdinal: 11,
  };
  const location = { latitude: 42.8864, longitude: -78.8784 };

  function baseRoute(overrides: Partial<Route> = {}): Route {
    return {
      id: routeId,
      cragId: 'crag-1',
      name: 'Higher Ground',
      location: { type: 'Point', coordinates: [-78.8784, 42.8864] },
      discipline: OutdoorDiscipline.SPORT_CLIMBING,
      gearRequirements: [],
      summary: 'A route seeded for verification scenarios.',
      proposedGradeOrdinal: 10,
      boltCount: null,
      minRopeLengthM: null,
      status: LifecycleStatus.UNVERIFIED,
      submittedBy: submitterId,
      verifiedAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    routeRepo = {
      findOne: vi.fn(),
      save: vi.fn(),
    };
    verificationRepo = {
      create: vi.fn(
        (data: Partial<RouteVerification>) =>
          ({ ...data }) as RouteVerification,
      ),
      save: vi.fn((v: RouteVerification) => ({ ...v, id: 'verification-1' })),
      count: vi.fn().mockResolvedValue(1),
    };
    cragRepo = {
      findOne: vi.fn(),
      save: vi.fn(),
    };
    insertQb = {};
    insertQb.insert = vi.fn().mockReturnValue(insertQb);
    insertQb.into = vi.fn().mockReturnValue(insertQb);
    insertQb.values = vi.fn().mockReturnValue(insertQb);
    insertQb.orUpdate = vi.fn().mockReturnValue(insertQb);
    insertQb.execute = vi.fn().mockResolvedValue({});

    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Route) return routeRepo;
        if (entity === RouteVerification) return verificationRepo;
        if (entity === Crag) return cragRepo;
        throw new Error('unexpected repository requested');
      }),
      query: vi.fn().mockResolvedValue([{ within: true }]),
      createQueryBuilder: vi.fn().mockReturnValue(insertQb),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    service = new VerificationService(dataSource as unknown as DataSource);
  });

  it('rejects the original submitter verifying their own route', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute({ submittedBy: verifierId }));

    await expect(
      service.submitRouteVerification(routeId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verificationRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the route is not found', async () => {
    routeRepo.findOne.mockResolvedValue(null);

    await expect(
      service.submitRouteVerification(routeId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects verification on an already-VERIFIED route', async () => {
    routeRepo.findOne.mockResolvedValue(
      baseRoute({ status: LifecycleStatus.VERIFIED }),
    );

    await expect(
      service.submitRouteVerification(routeId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(verificationRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a verifier outside the 300m proximity boundary, writing no row', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    manager.query.mockResolvedValue([{ within: false }]);

    await expect(
      service.submitRouteVerification(routeId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verificationRepo.save).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate verification as a clean 4xx, not a raw constraint violation', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    verificationRepo.save.mockRejectedValue(uniqueViolation());

    await expect(
      service.submitRouteVerification(routeId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('writes the verification row and upserts the grade vote in the same transaction, without flipping status below the 4th verification', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    verificationRepo.count.mockResolvedValue(2);

    const result = await service.submitRouteVerification(
      routeId,
      verifierId,
      dto,
      location,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(verificationRepo.save).toHaveBeenCalledTimes(1);
    const createArg = verificationRepo.create.mock
      .calls[0][0] as RouteVerification;
    expect(createArg.routeId).toBe(routeId);
    expect(createArg.verifierUserId).toBe(verifierId);
    expect(createArg.mediaAssetId).toBe(dto.mediaAssetId);

    expect(insertQb.into).toHaveBeenCalledWith(RouteGradeVote);
    expect(insertQb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId,
        voterUserId: verifierId,
        gradeOrdinal: dto.gradeOrdinal,
      }),
    );
    expect(insertQb.orUpdate).toHaveBeenCalledWith(
      ['grade_ordinal'],
      ['route_id', 'voter_user_id'],
    );

    expect(routeRepo.save).not.toHaveBeenCalled();
    expect(result.routeNewlyVerified).toBe(false);
    expect(result.cragNewlyVerified).toBe(false);
  });

  it('flips the route to VERIFIED and cascades its founding crag on the 4th unique verification', async () => {
    const route = baseRoute();
    routeRepo.findOne.mockResolvedValue(route);
    verificationRepo.count.mockResolvedValue(4);
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: routeId,
      status: LifecycleStatus.UNVERIFIED,
    });

    const result = await service.submitRouteVerification(
      routeId,
      verifierId,
      dto,
      location,
    );

    expect(routeRepo.save).toHaveBeenCalledTimes(1);
    const savedRoute = routeRepo.save.mock.calls[0][0] as Route;
    expect(savedRoute.status).toBe(LifecycleStatus.VERIFIED);
    expect(savedRoute.verifiedAt).toBeInstanceOf(Date);

    expect(cragRepo.save).toHaveBeenCalledTimes(1);
    const savedCrag = cragRepo.save.mock.calls[0][0] as Crag;
    expect(savedCrag.status).toBe(LifecycleStatus.VERIFIED);

    expect(result.routeNewlyVerified).toBe(true);
    expect(result.cragNewlyVerified).toBe(true);
  });

  it('flips a non-founding route to VERIFIED without touching its crag on the 4th verification', async () => {
    const route = baseRoute();
    routeRepo.findOne.mockResolvedValue(route);
    verificationRepo.count.mockResolvedValue(4);
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: 'some-other-route',
      status: LifecycleStatus.UNVERIFIED,
    });

    const result = await service.submitRouteVerification(
      routeId,
      verifierId,
      dto,
      location,
    );

    expect(routeRepo.save).toHaveBeenCalledTimes(1);
    expect(cragRepo.save).not.toHaveBeenCalled();
    expect(result.routeNewlyVerified).toBe(true);
    expect(result.cragNewlyVerified).toBe(false);
  });
});
