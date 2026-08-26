import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubmitRouteDto } from './dto/submit-route.dto';
import { RoutesService } from './routes.service';
import { Crag } from '../crags/entities/crag.entity';
import {
  Route,
  OutdoorDiscipline,
  GearRequirement,
} from './entities/route.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import type { DataSource } from 'typeorm';

function createQueryBuilderStub(result: unknown) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb.where = vi.fn().mockReturnValue(qb);
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
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let dataSource: {
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
  });

  const submitterId = 'user-1';

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
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Crag) return cragRepo;
        if (entity === Route) return routeRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Crag) return cragRepo;
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

    const result = await service.submitRoute(submitterId, dto);

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

    const result = await service.submitRoute(submitterId, dto);

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
    });

    await service.submitRoute(submitterId, boulderDto);

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
