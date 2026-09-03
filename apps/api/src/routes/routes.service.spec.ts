import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubmitRouteDto } from './dto/submit-route.dto';
import { AdminUpdateRouteDto } from './dto/admin-update-route.dto';
import { RoutesService } from './routes.service';
import { Crag } from '../crags/entities/crag.entity';
import {
  Route,
  OutdoorDiscipline,
  GearRequirement,
} from './entities/route.entity';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from '../media/entities/media-asset.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import type { DataSource } from 'typeorm';

const PHOTO_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

function makePhoto(
  id: string,
  overrides: Partial<MediaAsset> = {},
): MediaAsset {
  return {
    id,
    ownerUserId: 'user-1',
    purpose: MediaPurpose.ROUTE_SUBMISSION_PHOTO,
    payload: Buffer.from(''),
    mimeType: 'image/jpeg',
    byteSize: 1,
    moderationStatus: MediaModerationStatus.PENDING,
    subjectRouteId: null,
    subjectGymId: null,
    etag: 'e',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createQueryBuilderStub(result: unknown) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb.where = vi.fn().mockReturnValue(qb);
  qb.andWhere = vi.fn().mockReturnValue(qb);
  qb.orderBy = vi.fn().mockReturnValue(qb);
  qb.getOne = vi.fn().mockResolvedValue(result);
  qb.getMany = vi.fn().mockResolvedValue(Array.isArray(result) ? result : []);
  return qb;
}

describe('SubmitRouteDto validation', () => {
  const validSportRoute = {
    name: 'Warmup Wall',
    latitude: 42.8864,
    longitude: -78.8784,
    discipline: OutdoorDiscipline.SPORT_CLIMBING,
    summary: 'A pleasant warmup route with good exposure near the top.',
    proposedGradeOrdinal: 10,
    photoMediaIds: PHOTO_IDS,
  };

  it('accepts a fully-populated Sport submission with bolt count and rope length', async () => {
    const dto = plainToInstance(SubmitRouteDto, {
      ...validSportRoute,
      boltCount: 8,
      minRopeLengthM: 35,
      gearRequirements: [GearRequirement.QUICKDRAWS],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each([
    'name',
    'latitude',
    'longitude',
    'discipline',
    'summary',
    'proposedGradeOrdinal',
    'photoMediaIds',
  ])('rejects a submission missing mandatory field %s', async (field) => {
    const payload = { ...validSportRoute } as Record<string, unknown>;
    delete payload[field];
    const dto = plainToInstance(SubmitRouteDto, payload);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === field)).toBe(true);
  });

  it('accepts a Bouldering submission with no bolt count or rope length', async () => {
    const dto = plainToInstance(SubmitRouteDto, {
      ...validSportRoute,
      discipline: OutdoorDiscipline.BOULDERING,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a Bouldering submission that includes a bolt count', async () => {
    const dto = plainToInstance(SubmitRouteDto, {
      ...validSportRoute,
      discipline: OutdoorDiscipline.BOULDERING,
      boltCount: 6,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'discipline')).toBe(true);
  });

  it('rejects a Bouldering submission that includes a minimum rope length', async () => {
    const dto = plainToInstance(SubmitRouteDto, {
      ...validSportRoute,
      discipline: OutdoorDiscipline.BOULDERING,
      minRopeLengthM: 30,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'discipline')).toBe(true);
  });

  it('accepts a Trad submission with a minimum rope length but no bolt count', async () => {
    const dto = plainToInstance(SubmitRouteDto, {
      ...validSportRoute,
      discipline: OutdoorDiscipline.TRADITIONAL_CLIMBING,
      minRopeLengthM: 60,
      gearRequirements: [GearRequirement.TRAD_GEAR, GearRequirement.HELMET],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects fewer than 3 photo ids (BL-x05)', async () => {
    const dto = plainToInstance(SubmitRouteDto, {
      ...validSportRoute,
      photoMediaIds: PHOTO_IDS.slice(0, 2),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'photoMediaIds')).toBe(true);
  });
});

describe('RoutesService.submitRoute', () => {
  let cragRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let routeRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let mediaRepo: {
    find: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let query: ReturnType<typeof vi.fn>;
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let dataSource: {
    manager: { query: ReturnType<typeof vi.fn> };
    transaction: ReturnType<typeof vi.fn>;
    getRepository: ReturnType<typeof vi.fn>;
  };
  let service: RoutesService;

  const dto: SubmitRouteDto = plainToInstance(SubmitRouteDto, {
    name: 'Warmup Wall',
    latitude: 42.8864,
    longitude: -78.8784,
    discipline: OutdoorDiscipline.SPORT_CLIMBING,
    summary: 'A pleasant warmup route with good exposure near the top.',
    proposedGradeOrdinal: 10,
    boltCount: 8,
    gearRequirements: [GearRequirement.QUICKDRAWS],
    photoMediaIds: PHOTO_IDS,
  });

  const submitterId = 'user-1';
  const nonAdmin = {
    deviceLocation: { latitude: 42.8864, longitude: -78.8784 },
    isAdmin: false,
  };
  const admin = {
    deviceLocation: { latitude: 0, longitude: 0 },
    isAdmin: true,
  };

  beforeEach(() => {
    cragRepo = {
      create: vi.fn((data: Partial<Crag>) => ({ ...data }) as Crag),
      save: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    routeRepo = {
      create: vi.fn((data: Partial<Route>) => ({ ...data }) as Route),
      save: vi.fn(),
    };
    mediaRepo = {
      find: vi.fn().mockResolvedValue(PHOTO_IDS.map((id) => makePhoto(id))),
      save: vi.fn((rows: MediaAsset[]) => rows),
    };
    query = vi.fn().mockResolvedValue([{ within: true }]);
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Crag) return cragRepo;
        if (entity === Route) return routeRepo;
        if (entity === MediaAsset) return mediaRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    dataSource = {
      manager: { query },
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Crag) return cragRepo;
        if (entity === Route) return routeRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    service = new RoutesService(dataSource as unknown as DataSource);
  });

  it('creates a crag and a route in one transaction when no crag exists within 300m, setting founding_route_id', async () => {
    cragRepo.createQueryBuilder.mockReturnValue(createQueryBuilderStub(null));
    cragRepo.save
      .mockImplementationOnce((c: Crag) => ({ ...c, id: 'crag-1' }))
      .mockImplementationOnce((c: Crag) => c);
    routeRepo.save.mockImplementation((r: Route) => ({ ...r, id: 'route-1' }));

    const result = await service.submitRoute(submitterId, dto, nonAdmin);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(cragRepo.save).toHaveBeenCalledTimes(2);
    expect(routeRepo.save).toHaveBeenCalledTimes(1);

    const routeArg = routeRepo.create.mock.calls[0][0] as Route;
    expect(routeArg.cragId).toBe('crag-1');
    expect(routeArg.submittedBy).toBe(submitterId);
    expect(routeArg.status).toBe(LifecycleStatus.UNVERIFIED);

    const finalCragSave = cragRepo.save.mock.calls[1][0] as Crag;
    expect(finalCragSave.foundingRouteId).toBe('route-1');

    expect(result.cragCreated).toBe(true);
    expect(result.crag.foundingRouteId).toBe('route-1');
    expect(result.route.id).toBe('route-1');

    // BL-x05: photos stamped with the new route id, left PENDING for a
    // non-admin submission.
    const savedPhotos = mediaRepo.save.mock.calls[0][0] as MediaAsset[];
    expect(savedPhotos.map((p) => p.subjectRouteId)).toEqual([
      'route-1',
      'route-1',
      'route-1',
    ]);
    expect(
      savedPhotos.every(
        (p) => p.moderationStatus === MediaModerationStatus.PENDING,
      ),
    ).toBe(true);
  });

  it('rejects a non-admin pin outside 300m of the device location (BL-x02 / §19.4)', async () => {
    query.mockResolvedValue([{ within: false }]);
    await expect(
      service.submitRoute(submitterId, dto, nonAdmin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('admin authoring: skips the proximity gate, creates route AND founding crag VERIFIED, photos APPROVED (BL-x03)', async () => {
    query.mockResolvedValue([{ within: false }]); // would block a non-admin
    cragRepo.createQueryBuilder.mockReturnValue(createQueryBuilderStub(null));
    cragRepo.save
      .mockImplementationOnce((c: Crag) => ({ ...c, id: 'crag-1' }))
      .mockImplementationOnce((c: Crag) => c);
    routeRepo.save.mockImplementation((r: Route) => ({ ...r, id: 'route-1' }));

    const result = await service.submitRoute(submitterId, dto, admin);

    expect(query).not.toHaveBeenCalled();
    const routeArg = routeRepo.create.mock.calls[0][0] as Route;
    expect(routeArg.status).toBe(LifecycleStatus.VERIFIED);
    expect(routeArg.verifiedAt).toBeInstanceOf(Date);
    const cragArg = cragRepo.create.mock.calls[0][0] as Crag;
    expect(cragArg.status).toBe(LifecycleStatus.VERIFIED);
    expect(result.cragCreated).toBe(true);

    const savedPhotos = mediaRepo.save.mock.calls[0][0] as MediaAsset[];
    expect(
      savedPhotos.every(
        (p) => p.moderationStatus === MediaModerationStatus.APPROVED,
      ),
    ).toBe(true);
  });

  it('attaches to an existing crag within 300m as a non-founding child, leaving the crag untouched', async () => {
    const existingCrag: Crag = {
      id: 'crag-9',
      name: "Devil's Hole",
      location: { type: 'Point', coordinates: [-78.8784, 42.8864] },
      status: LifecycleStatus.UNVERIFIED,
      foundingRouteId: 'route-0',
      createdBy: 'someone-else',
      verifiedAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    cragRepo.createQueryBuilder.mockReturnValue(
      createQueryBuilderStub(existingCrag),
    );
    routeRepo.save.mockImplementation((r: Route) => ({ ...r, id: 'route-2' }));

    const result = await service.submitRoute(submitterId, dto, nonAdmin);

    expect(cragRepo.save).not.toHaveBeenCalled();
    const routeArg = routeRepo.create.mock.calls[0][0] as Route;
    expect(routeArg.cragId).toBe('crag-9');

    expect(result.cragCreated).toBe(false);
    expect(result.crag).toBe(existingCrag);
    expect(result.crag.foundingRouteId).toBe('route-0');
    expect(result.crag.status).toBe(LifecycleStatus.UNVERIFIED);
  });

  it('defaults gearRequirements to an empty array and nulls bolt/rope fields when omitted', async () => {
    cragRepo.createQueryBuilder.mockReturnValue(
      createQueryBuilderStub({
        id: 'crag-9',
        foundingRouteId: 'route-0',
        status: LifecycleStatus.UNVERIFIED,
      }),
    );
    routeRepo.save.mockImplementation((r: Route) => ({ ...r, id: 'route-3' }));

    const boulderDto = plainToInstance(SubmitRouteDto, {
      name: 'Low Traverse',
      latitude: 42.8864,
      longitude: -78.8784,
      discipline: OutdoorDiscipline.BOULDERING,
      summary: 'A short, powerful traverse problem.',
      proposedGradeOrdinal: 4,
      photoMediaIds: PHOTO_IDS,
    });

    await service.submitRoute(submitterId, boulderDto, nonAdmin);

    const routeArg = routeRepo.create.mock.calls[0][0] as Route;
    expect(routeArg.gearRequirements).toEqual([]);
    expect(routeArg.boltCount).toBeNull();
    expect(routeArg.minRopeLengthM).toBeNull();
  });

  it('findVisibleCrags excludes crags with zero non-archived routes', async () => {
    const visible = [{ id: 'crag-visible' } as Crag];
    cragRepo.createQueryBuilder.mockReturnValue(
      createQueryBuilderStub(visible),
    );

    const result = await service.findVisibleCrags();

    expect(cragRepo.createQueryBuilder).toHaveBeenCalledWith('crag');
    expect(result).toBe(visible);
  });
});

describe('RoutesService.adminUpdateRoute (BL-x07)', () => {
  let routeRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let service: RoutesService;

  function baseRoute(overrides: Partial<Route> = {}): Route {
    return {
      id: 'route-1',
      cragId: 'crag-1',
      name: 'Old',
      location: { type: 'Point', coordinates: [-78.8784, 42.8864] },
      discipline: OutdoorDiscipline.SPORT_CLIMBING,
      gearRequirements: [],
      summary: 'old summary',
      proposedGradeOrdinal: 10,
      boltCount: 8,
      minRopeLengthM: null,
      status: LifecycleStatus.VERIFIED,
      submittedBy: 'user-1',
      verifiedAt: new Date(),
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  let cragRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let mediaRepo: {
    find: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let query: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    routeRepo = {
      findOne: vi.fn(),
      save: vi.fn((r: Route) => r),
      find: vi.fn(),
    };
    cragRepo = { findOne: vi.fn(), save: vi.fn((c: Crag) => c) };
    mediaRepo = { find: vi.fn().mockResolvedValue([]), save: vi.fn() };
    query = vi.fn().mockResolvedValue([]);
    const txManager = {
      getRepository: vi.fn((e: unknown) => {
        if (e === Route) return routeRepo;
        if (e === Crag) return cragRepo;
        if (e === MediaAsset) return mediaRepo;
        throw new Error('unexpected repo');
      }),
      query,
    };
    const dataSource = {
      getRepository: vi.fn(() => routeRepo),
      transaction: vi.fn((cb: (m: typeof txManager) => unknown) =>
        cb(txManager),
      ),
      query,
    };
    service = new RoutesService(dataSource as unknown as DataSource);
  });

  it('throws NotFound for an unknown route', async () => {
    routeRepo.findOne.mockResolvedValue(null);
    await expect(
      service.adminUpdateRoute(
        'route-x',
        plainToInstance(AdminUpdateRouteDto, { name: 'X' }),
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only the fields present, and can clear boltCount with an explicit null', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    const result = await service.adminUpdateRoute(
      'route-1',
      plainToInstance(AdminUpdateRouteDto, {
        summary: 'new summary',
        boltCount: null,
      }),
      'admin-1',
    );
    expect(result.summary).toBe('new summary');
    expect(result.boltCount).toBeNull();
    expect(result.name).toBe('Old');
  });

  it('getRouteForAdmin returns editable fields + isFoundingRoute + photos', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      name: 'Warmup Wall',
      foundingRouteId: 'route-1',
    });
    mediaRepo.find.mockResolvedValue([
      makePhoto('11111111-1111-4111-8111-111111111111', {
        subjectRouteId: 'route-1',
      }),
    ]);

    const view = await service.getRouteForAdmin('route-1');
    expect(view.isFoundingRoute).toBe(true);
    expect(view.latitude).toBe(42.8864);
    expect(view.longitude).toBe(-78.8784);
    expect(view.photos).toHaveLength(1);
  });

  it('hardDeleteRoute on a non-founding route deletes just it and its dependents', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: 'route-0',
    });

    const result = await service.hardDeleteRoute('route-1');
    expect(result).toEqual({
      routeId: 'route-1',
      deleted: true,
      cragDeleted: false,
      siblingRoutesDeleted: 0,
    });
    const statements = query.mock.calls.map((c) => c[0] as string);
    expect(statements.some((s) => s.includes('route_verifications'))).toBe(
      true,
    );
    expect(statements.some((s) => s.includes('route_grade_votes'))).toBe(true);
    expect(statements.some((s) => s.includes('climb_logs'))).toBe(true);
    expect(
      statements.some((s) => /DELETE FROM "routes" WHERE "id"/.test(s)),
    ).toBe(true);
    expect(statements.some((s) => s.includes('DELETE FROM "crags"'))).toBe(
      false,
    );
  });

  it('hardDeleteRoute on a founding route removes the whole crag and its siblings', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: 'route-1',
    });
    routeRepo.find.mockResolvedValue([
      baseRoute({ id: 'route-1' }),
      baseRoute({ id: 'route-2' }),
      baseRoute({ id: 'route-3' }),
    ]);

    const result = await service.hardDeleteRoute('route-1');
    expect(result.cragDeleted).toBe(true);
    expect(result.siblingRoutesDeleted).toBe(2);
    const statements = query.mock.calls.map((c) => c[0] as string);
    expect(
      statements.some((s) => s.includes('founding_route_id" = NULL')),
    ).toBe(true);
    expect(
      statements.some((s) => /DELETE FROM "routes" WHERE "crag_id"/.test(s)),
    ).toBe(true);
    expect(statements.some((s) => s.includes('DELETE FROM "crags"'))).toBe(
      true,
    );
  });

  it('restoreRoute un-archives an ARCHIVED founding route and its crag', async () => {
    routeRepo.findOne.mockResolvedValue(
      baseRoute({ status: LifecycleStatus.ARCHIVED, archivedAt: new Date() }),
    );
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: 'route-1',
      status: LifecycleStatus.ARCHIVED,
    });

    const result = await service.restoreRoute('route-1');
    expect(result.restored).toBe(true);
    expect(result.cragRestored).toBe(true);
    const savedRoute = routeRepo.save.mock.calls[0][0] as Route;
    expect(savedRoute.status).toBe(LifecycleStatus.UNVERIFIED);
    const savedCrag = cragRepo.save.mock.calls[0][0] as Crag;
    expect(savedCrag.status).toBe(LifecycleStatus.UNVERIFIED);
  });
});

describe('RoutesService.forceArchiveRoute (BL-035)', () => {
  let routeRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let cragRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let service: RoutesService;

  function baseRoute(overrides: Partial<Route> = {}): Route {
    return {
      id: 'route-1',
      cragId: 'crag-1',
      name: 'Warmup Wall',
      location: { type: 'Point', coordinates: [-78.8784, 42.8864] },
      discipline: OutdoorDiscipline.SPORT_CLIMBING,
      gearRequirements: [],
      summary: 'x',
      proposedGradeOrdinal: 10,
      boltCount: 8,
      minRopeLengthM: null,
      status: LifecycleStatus.VERIFIED,
      submittedBy: 'user-1',
      verifiedAt: new Date(),
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function baseCrag(overrides: Partial<Crag> = {}): Crag {
    return {
      id: 'crag-1',
      name: 'Warmup Wall',
      location: { type: 'Point', coordinates: [-78.8784, 42.8864] },
      status: LifecycleStatus.VERIFIED,
      foundingRouteId: 'route-1',
      createdBy: 'user-1',
      verifiedAt: new Date(),
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    routeRepo = { findOne: vi.fn(), save: vi.fn((r: Route) => r) };
    cragRepo = { findOne: vi.fn(), save: vi.fn((c: Crag) => c) };
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Route) return routeRepo;
        if (entity === Crag) return cragRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    service = new RoutesService(dataSource as unknown as DataSource);
  });

  it('throws NotFound when the route does not exist', async () => {
    routeRepo.findOne.mockResolvedValue(null);
    await expect(service.forceArchiveRoute('route-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(routeRepo.save).not.toHaveBeenCalled();
  });

  it('archives a non-founding route without touching its crag', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    cragRepo.findOne.mockResolvedValue(
      baseCrag({ foundingRouteId: 'route-0' }),
    );

    const result = await service.forceArchiveRoute('route-1');

    expect(result).toEqual({
      routeId: 'route-1',
      routeArchived: true,
      cragArchived: false,
      alreadyArchived: false,
    });
    const saved = routeRepo.save.mock.calls[0][0] as Route;
    expect(saved.status).toBe(LifecycleStatus.ARCHIVED);
    expect(saved.archivedAt).toBeInstanceOf(Date);
    expect(cragRepo.save).not.toHaveBeenCalled();
  });

  it('cascades a founding route archival to its crag (even while the crag is VERIFIED)', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    cragRepo.findOne.mockResolvedValue(baseCrag());

    const result = await service.forceArchiveRoute('route-1');

    expect(result.cragArchived).toBe(true);
    const savedCrag = cragRepo.save.mock.calls[0][0] as Crag;
    expect(savedCrag.status).toBe(LifecycleStatus.ARCHIVED);
    expect(savedCrag.archivedAt).toBeInstanceOf(Date);
  });

  it('is a no-op when the route is already ARCHIVED', async () => {
    routeRepo.findOne.mockResolvedValue(
      baseRoute({ status: LifecycleStatus.ARCHIVED }),
    );

    const result = await service.forceArchiveRoute('route-1');

    expect(result).toEqual({
      routeId: 'route-1',
      routeArchived: false,
      cragArchived: false,
      alreadyArchived: true,
    });
    expect(routeRepo.save).not.toHaveBeenCalled();
    expect(cragRepo.save).not.toHaveBeenCalled();
  });

  it('does not re-archive a crag that is already ARCHIVED', async () => {
    routeRepo.findOne.mockResolvedValue(baseRoute());
    cragRepo.findOne.mockResolvedValue(
      baseCrag({ status: LifecycleStatus.ARCHIVED }),
    );

    const result = await service.forceArchiveRoute('route-1');

    expect(result.routeArchived).toBe(true);
    expect(result.cragArchived).toBe(false);
    expect(cragRepo.save).not.toHaveBeenCalled();
  });
});
