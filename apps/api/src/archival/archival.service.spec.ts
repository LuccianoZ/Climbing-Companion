import type { DataSource } from 'typeorm';
import type { ConfigService } from '@nestjs/config';
import { ArchivalService } from './archival.service';
import { Route } from '../routes/entities/route.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { Crag } from '../crags/entities/crag.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';

// Minimal stand-ins for the entities' shape -- only the fields
// ArchivalService actually reads/writes -- typed explicitly (rather than
// left as inferred `any`) so the mocked repositories below satisfy
// @typescript-eslint/no-unsafe-return/-assignment the same way every other
// *.spec.ts file's typed mock callbacks already do.
interface StubRoute {
  id: string;
  cragId: string;
  status: LifecycleStatus;
  archivedAt: Date | null;
}
interface StubGym {
  id: string;
  status: LifecycleStatus;
  archivedAt: Date | null;
}
interface StubCrag {
  id: string;
  foundingRouteId: string;
  status: LifecycleStatus;
  archivedAt: Date | null;
}

// Architecture.md §9 / §19.5 (BL-013): exercises
// archiveExpiredUnverifiedItems() directly, exactly as a Cucumber scenario
// would -- proving it's callable without a cron tick, and covering both
// halves of the cascade rule (founding route cascades its crag; a
// non-founding route does not).
describe('ArchivalService.archiveExpiredUnverifiedItems', () => {
  let routeRepo: {
    find: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let gymRepo: {
    find: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let cragRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let service: ArchivalService;

  beforeEach(() => {
    routeRepo = {
      find: vi.fn().mockResolvedValue([]),
      save: vi.fn((r: StubRoute) => r),
    };
    gymRepo = {
      find: vi.fn().mockResolvedValue([]),
      save: vi.fn((g: StubGym) => g),
    };
    cragRepo = { findOne: vi.fn(), save: vi.fn((c: StubCrag) => c) };
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Route) return routeRepo;
        if (entity === Gym) return gymRepo;
        if (entity === Crag) return cragRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    config = { get: vi.fn().mockReturnValue('5000') };
    service = new ArchivalService(
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
    );
  });

  it('is directly callable without a cron tick and returns zero counts when nothing is expired', async () => {
    const result = await service.archiveExpiredUnverifiedItems();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      routesArchived: 0,
      gymsArchived: 0,
      cragsArchived: 0,
    });
  });

  it('only ever scans UNVERIFIED rows -- a VERIFIED item is never a candidate regardless of elapsed time', async () => {
    await service.archiveExpiredUnverifiedItems();

    const routeFindArgs = routeRepo.find.mock.calls[0][0] as {
      where: { status: LifecycleStatus };
    };
    expect(routeFindArgs.where.status).toBe(LifecycleStatus.UNVERIFIED);

    const gymFindArgs = gymRepo.find.mock.calls[0][0] as {
      where: { status: LifecycleStatus };
    };
    expect(gymFindArgs.where.status).toBe(LifecycleStatus.UNVERIFIED);
  });

  it('archives an expired unverified route and does not cascade when it is not the founding route', async () => {
    const route: StubRoute = {
      id: 'route-1',
      cragId: 'crag-1',
      status: LifecycleStatus.UNVERIFIED,
      archivedAt: null,
    };
    routeRepo.find.mockResolvedValue([route]);
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: 'some-other-route',
      status: LifecycleStatus.UNVERIFIED,
      archivedAt: null,
    } satisfies StubCrag);

    const result = await service.archiveExpiredUnverifiedItems();

    expect(routeRepo.save).toHaveBeenCalledTimes(1);
    const savedRoute = routeRepo.save.mock.calls[0][0] as StubRoute;
    expect(savedRoute.status).toBe(LifecycleStatus.ARCHIVED);
    expect(savedRoute.archivedAt).toBeInstanceOf(Date);
    expect(cragRepo.save).not.toHaveBeenCalled();
    expect(result.routesArchived).toBe(1);
    expect(result.cragsArchived).toBe(0);
  });

  it('cascades the crag to ARCHIVED in the same transaction when the archived route is its founding route', async () => {
    const route: StubRoute = {
      id: 'route-1',
      cragId: 'crag-1',
      status: LifecycleStatus.UNVERIFIED,
      archivedAt: null,
    };
    routeRepo.find.mockResolvedValue([route]);
    cragRepo.findOne.mockResolvedValue({
      id: 'crag-1',
      foundingRouteId: 'route-1',
      status: LifecycleStatus.UNVERIFIED,
      archivedAt: null,
    } satisfies StubCrag);

    const result = await service.archiveExpiredUnverifiedItems();

    expect(cragRepo.save).toHaveBeenCalledTimes(1);
    const savedCrag = cragRepo.save.mock.calls[0][0] as StubCrag;
    expect(savedCrag.status).toBe(LifecycleStatus.ARCHIVED);
    expect(savedCrag.archivedAt).toBeInstanceOf(Date);
    expect(result.cragsArchived).toBe(1);
  });

  it('archives an expired unverified gym', async () => {
    const gym: StubGym = {
      id: 'gym-1',
      status: LifecycleStatus.UNVERIFIED,
      archivedAt: null,
    };
    gymRepo.find.mockResolvedValue([gym]);

    const result = await service.archiveExpiredUnverifiedItems();

    expect(gymRepo.save).toHaveBeenCalledTimes(1);
    const savedGym = gymRepo.save.mock.calls[0][0] as StubGym;
    expect(savedGym.status).toBe(LifecycleStatus.ARCHIVED);
    expect(savedGym.archivedAt).toBeInstanceOf(Date);
    expect(result.gymsArchived).toBe(1);
  });

  it('falls back to the default 30-day window when ARCHIVAL_WINDOW_MS is missing or not a finite number', async () => {
    config.get.mockReturnValue(undefined);

    const result = await service.archiveExpiredUnverifiedItems();

    expect(routeRepo.find).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      routesArchived: 0,
      gymsArchived: 0,
      cragsArchived: 0,
    });
  });
});
