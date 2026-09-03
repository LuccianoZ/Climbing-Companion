import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { VerificationService } from './verification.service';
import { Route, OutdoorDiscipline } from '../routes/entities/route.entity';
import { Crag } from '../crags/entities/crag.entity';
import { Gym, GymDiscipline } from '../gyms/entities/gym.entity';
import { RouteVerification } from './entities/route-verification.entity';
import { RouteGradeVote } from './entities/route-grade-vote.entity';
import { GymVerification } from './entities/gym-verification.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import type { SubmitRouteVerificationDto } from './dto/submit-route-verification.dto';
import type { SubmitGymVerificationDto } from './dto/submit-gym-verification.dto';

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

describe('VerificationService.submitGymVerification', () => {
  let gymRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let verificationRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let manager: {
    getRepository: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let service: VerificationService;

  const gymId = 'gym-1';
  const verifierId = 'verifier-1';
  const submitterId = 'submitter-1';
  const dto: SubmitGymVerificationDto = {
    mediaAssetId: 'media-1',
    disciplinesSubmitted: [GymDiscipline.TOP_ROPE],
  };
  const location = { latitude: 42.8901, longitude: -78.8712 };

  function baseGym(overrides: Partial<Gym> = {}): Gym {
    return {
      id: gymId,
      name: 'Vertical Edge Climbing Gym',
      location: { type: 'Point', coordinates: [-78.8712, 42.8901] },
      status: LifecycleStatus.UNVERIFIED,
      disciplinesOffered: [],
      submittedBy: submitterId,
      verifiedDirectlyByAdmin: false,
      verifiedAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    gymRepo = {
      findOne: vi.fn(),
      save: vi.fn(),
    };
    verificationRepo = {
      create: vi.fn(
        (data: Partial<GymVerification>) => ({ ...data }) as GymVerification,
      ),
      save: vi.fn((v: GymVerification) => ({ ...v, id: 'gym-verification-1' })),
      count: vi.fn().mockResolvedValue(1),
    };
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Gym) return gymRepo;
        if (entity === GymVerification) return verificationRepo;
        throw new Error('unexpected repository requested');
      }),
      query: vi.fn().mockResolvedValue([{ within: true }]),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    service = new VerificationService(dataSource as unknown as DataSource);
  });

  it('rejects the original submitter verifying their own gym', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym({ submittedBy: verifierId }));

    await expect(
      service.submitGymVerification(gymId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verificationRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the gym is not found', async () => {
    gymRepo.findOne.mockResolvedValue(null);

    await expect(
      service.submitGymVerification(gymId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects verification on an already-VERIFIED gym', async () => {
    gymRepo.findOne.mockResolvedValue(
      baseGym({ status: LifecycleStatus.VERIFIED }),
    );

    await expect(
      service.submitGymVerification(gymId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(verificationRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a verifier outside the 300m proximity boundary, writing no row', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    manager.query.mockResolvedValue([{ within: false }]);

    await expect(
      service.submitGymVerification(gymId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verificationRepo.save).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate verification as a clean 4xx, not a raw constraint violation', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    verificationRepo.save.mockRejectedValue(uniqueViolation());

    await expect(
      service.submitGymVerification(gymId, verifierId, dto, location),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('writes the verification row without flipping status below the 4th verification', async () => {
    gymRepo.findOne.mockResolvedValue(baseGym());
    verificationRepo.count.mockResolvedValue(2);

    const result = await service.submitGymVerification(
      gymId,
      verifierId,
      dto,
      location,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(verificationRepo.save).toHaveBeenCalledTimes(1);
    const createArg = verificationRepo.create.mock
      .calls[0][0] as GymVerification;
    expect(createArg.gymId).toBe(gymId);
    expect(createArg.verifierUserId).toBe(verifierId);
    expect(createArg.mediaAssetId).toBe(dto.mediaAssetId);
    expect(createArg.disciplinesSubmitted).toEqual(dto.disciplinesSubmitted);

    expect(gymRepo.save).not.toHaveBeenCalled();
    expect(result.gymNewlyVerified).toBe(false);
  });

  it("flips the gym to VERIFIED and unions all four submissions' disciplines on the 4th unique verification", async () => {
    const gym = baseGym();
    gymRepo.findOne.mockResolvedValue(gym);
    verificationRepo.count.mockResolvedValue(4);
    manager.query
      .mockResolvedValueOnce([{ within: true }])
      .mockResolvedValueOnce([
        { discipline: GymDiscipline.TOP_ROPE },
        { discipline: GymDiscipline.LEAD },
        { discipline: GymDiscipline.BOULDERING },
      ]);

    const result = await service.submitGymVerification(
      gymId,
      verifierId,
      dto,
      location,
    );

    expect(gymRepo.save).toHaveBeenCalledTimes(1);
    const savedGym = gymRepo.save.mock.calls[0][0] as Gym;
    expect(savedGym.status).toBe(LifecycleStatus.VERIFIED);
    expect(savedGym.verifiedAt).toBeInstanceOf(Date);
    expect(savedGym.disciplinesOffered).toEqual([
      GymDiscipline.TOP_ROPE,
      GymDiscipline.LEAD,
      GymDiscipline.BOULDERING,
    ]);

    expect(result.gymNewlyVerified).toBe(true);
  });
});

// BL-029 (never cut) / AR-47: the reverse of the forward verification path,
// run inside ModerationService's transaction when an admin rejects a
// verification photo.
describe('VerificationService.voidRouteVerificationByPhoto', () => {
  let routeVerificationRepo: {
    findOne: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let routeRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let cragRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let service: VerificationService;

  const mediaAssetId = 'photo-1';
  const routeId = 'route-9';

  beforeEach(() => {
    routeVerificationRepo = {
      findOne: vi.fn(),
      remove: vi.fn(),
      count: vi.fn().mockResolvedValue(3),
    };
    routeRepo = { findOne: vi.fn(), save: vi.fn((r: Route) => r) };
    cragRepo = { findOne: vi.fn(), save: vi.fn((c: Crag) => c) };
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === RouteVerification) return routeVerificationRepo;
        if (entity === Route) return routeRepo;
        if (entity === Crag) return cragRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    service = new VerificationService({} as unknown as DataSource);
  });

  it('no-ops when no verification row points at the rejected photo', async () => {
    routeVerificationRepo.findOne.mockResolvedValue(null);

    const result = await service.voidRouteVerificationByPhoto(
      manager as never,
      mediaAssetId,
    );

    expect(result).toEqual({
      voided: false,
      routeReverted: false,
      cragReverted: false,
      routeId: null,
    });
    expect(routeVerificationRepo.remove).not.toHaveBeenCalled();
  });

  it('deletes the row but leaves a still-verified route alone when the count stays >= 4', async () => {
    routeVerificationRepo.findOne.mockResolvedValue({ routeId, mediaAssetId });
    routeVerificationRepo.count.mockResolvedValue(4);
    routeRepo.findOne.mockResolvedValue({
      id: routeId,
      cragId: 'crag-1',
      status: LifecycleStatus.VERIFIED,
      verifiedAt: new Date(),
    });

    const result = await service.voidRouteVerificationByPhoto(
      manager as never,
      mediaAssetId,
    );

    expect(routeVerificationRepo.remove).toHaveBeenCalled();
    expect(result.voided).toBe(true);
    expect(result.routeReverted).toBe(false);
    expect(routeRepo.save).not.toHaveBeenCalled();
  });

  it('reverts VERIFIED -> UNVERIFIED and cascades the crag when the founding route drops below 4', async () => {
    routeVerificationRepo.findOne.mockResolvedValue({ routeId, mediaAssetId });
    routeVerificationRepo.count.mockResolvedValue(3);
    routeRepo.findOne.mockResolvedValue({
      id: routeId,
      cragId: 'crag-1',
      status: LifecycleStatus.VERIFIED,
      verifiedAt: new Date(),
    });
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: routeId,
      status: LifecycleStatus.VERIFIED,
      verifiedAt: new Date(),
    });

    const result = await service.voidRouteVerificationByPhoto(
      manager as never,
      mediaAssetId,
    );

    expect(result.routeReverted).toBe(true);
    expect(result.cragReverted).toBe(true);
    const savedRoute = routeRepo.save.mock.calls[0][0] as Route;
    expect(savedRoute.status).toBe(LifecycleStatus.UNVERIFIED);
    expect(savedRoute.verifiedAt).toBeNull();
    const savedCrag = cragRepo.save.mock.calls[0][0] as Crag;
    expect(savedCrag.status).toBe(LifecycleStatus.UNVERIFIED);
  });

  it('reverts a non-founding route without touching the crag', async () => {
    routeVerificationRepo.findOne.mockResolvedValue({ routeId, mediaAssetId });
    routeVerificationRepo.count.mockResolvedValue(3);
    routeRepo.findOne.mockResolvedValue({
      id: routeId,
      cragId: 'crag-1',
      status: LifecycleStatus.VERIFIED,
      verifiedAt: new Date(),
    });
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: 'some-other-route',
      status: LifecycleStatus.VERIFIED,
      verifiedAt: new Date(),
    });

    const result = await service.voidRouteVerificationByPhoto(
      manager as never,
      mediaAssetId,
    );

    expect(result.routeReverted).toBe(true);
    expect(result.cragReverted).toBe(false);
    expect(cragRepo.save).not.toHaveBeenCalled();
  });
});

describe('VerificationService.voidGymVerificationByPhoto', () => {
  let gymVerificationRepo: {
    findOne: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let gymRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let service: VerificationService;

  const mediaAssetId = 'gym-photo-1';
  const gymId = 'gym-9';

  beforeEach(() => {
    gymVerificationRepo = {
      findOne: vi.fn(),
      remove: vi.fn(),
      count: vi.fn().mockResolvedValue(3),
    };
    gymRepo = { findOne: vi.fn(), save: vi.fn((g: Gym) => g) };
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === GymVerification) return gymVerificationRepo;
        if (entity === Gym) return gymRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    service = new VerificationService({} as unknown as DataSource);
  });

  it('reverts a VERIFIED gym to UNVERIFIED when a rejected photo drops it below 4', async () => {
    gymVerificationRepo.findOne.mockResolvedValue({ gymId, mediaAssetId });
    gymVerificationRepo.count.mockResolvedValue(3);
    gymRepo.findOne.mockResolvedValue({
      id: gymId,
      status: LifecycleStatus.VERIFIED,
      verifiedAt: new Date(),
    });

    const result = await service.voidGymVerificationByPhoto(
      manager as never,
      mediaAssetId,
    );

    expect(result).toEqual({ voided: true, gymReverted: true, gymId });
    const savedGym = gymRepo.save.mock.calls[0][0] as Gym;
    expect(savedGym.status).toBe(LifecycleStatus.UNVERIFIED);
    expect(savedGym.verifiedAt).toBeNull();
  });

  it('no-ops when no gym verification row points at the photo', async () => {
    gymVerificationRepo.findOne.mockResolvedValue(null);
    const result = await service.voidGymVerificationByPhoto(
      manager as never,
      mediaAssetId,
    );
    expect(result.voided).toBe(false);
  });
});
