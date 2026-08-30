import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { DataSource } from 'typeorm';
import { SearchMapDto } from './dto/search-map.dto';
import { MapService, VERIFICATIONS_REQUIRED_TO_VERIFY } from './map.service';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import { GymDiscipline } from '../gyms/entities/gym.entity';
import {
  GearRequirement,
  OutdoorDiscipline,
} from '../routes/entities/route.entity';
import type { GradeVoteService } from '../grade-votes/grade-vote.service';

// A QueryBuilder test double: every chainable method returns `this`, and
// getMany() resolves whatever rows the individual test staged. Assertions
// about *which* filters were applied read the recorded `where` calls
// rather than trying to parse generated SQL -- the SQL itself is covered
// by map-and-search.feature against a real Postgres.
function stubQueryBuilder(rows: unknown[]) {
  const calls: Array<[string, unknown]> = [];
  const qb = {
    calls,
    where(clause: string, params?: unknown) {
      calls.push([clause, params]);
      return qb;
    },
    andWhere(clause: string, params?: unknown) {
      calls.push([clause, params]);
      return qb;
    },
    orderBy() {
      return qb;
    },
    getMany: vi.fn().mockResolvedValue(rows),
  };
  return qb;
}

function point(latitude: number, longitude: number) {
  return {
    type: 'Point' as const,
    coordinates: [longitude, latitude] as [number, number],
  };
}

const CRAG = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'The Great Wall',
  status: LifecycleStatus.VERIFIED,
  location: point(37.7338, -119.5676),
};

const UNVERIFIED_GYM = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Vertical Edge Climbing Gym',
  status: LifecycleStatus.UNVERIFIED,
  location: point(42.8864, -78.8784),
  disciplinesOffered: [GymDiscipline.BOULDERING, GymDiscipline.LEAD],
};

const ROUTE = {
  id: '33333333-3333-4333-8333-333333333333',
  cragId: CRAG.id,
  name: 'Solar Power',
  discipline: OutdoorDiscipline.SPORT_CLIMBING,
  gearRequirements: [GearRequirement.QUICKDRAWS, GearRequirement.HELMET],
  summary: 'Sustained face climbing on good edges.',
  boltCount: 12,
  minRopeLengthM: 60,
  status: LifecycleStatus.UNVERIFIED,
  location: point(37.734, -119.5679),
  proposedGradeOrdinal: 14,
};

const CONSENSUS = {
  source: 'CONSENSUS' as const,
  gradeOrdinal: 14,
  totalVotes: 5,
  distribution: [
    { gradeOrdinal: 14, voteCount: 3 },
    { gradeOrdinal: 15, voteCount: 2 },
  ],
};

interface Harness {
  service: MapService;
  query: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  computeConsensus: ReturnType<typeof vi.fn>;
  cragQb: ReturnType<typeof stubQueryBuilder>;
  gymQb: ReturnType<typeof stubQueryBuilder>;
  routeQb: ReturnType<typeof stubQueryBuilder>;
}

function makeService(options: {
  crags?: unknown[];
  gyms?: unknown[];
  routes?: unknown[];
  findOneResult?: unknown;
  queryResult?: unknown[];
}): Harness {
  const cragQb = stubQueryBuilder(options.crags ?? []);
  const gymQb = stubQueryBuilder(options.gyms ?? []);
  const routeQb = stubQueryBuilder(options.routes ?? []);
  const findOne = vi.fn().mockResolvedValue(options.findOneResult ?? null);
  const query = vi.fn().mockResolvedValue(options.queryResult ?? []);

  // Repository selection keys off the entity class's own name so a single
  // getRepository stub can serve crags, gyms and routes in one test.
  const getRepository = (entity: { name: string }) => ({
    findOne,
    createQueryBuilder: () =>
      entity.name === 'Crag' ? cragQb : entity.name === 'Gym' ? gymQb : routeQb,
  });

  const dataSource = {
    getRepository,
    query,
    manager: { id: 'default-manager' },
  } as unknown as DataSource;

  const computeConsensus = vi.fn().mockResolvedValue(CONSENSUS);
  const gradeVoteService = { computeConsensus } as unknown as GradeVoteService;

  return {
    service: new MapService(dataSource, gradeVoteService),
    query,
    findOne,
    computeConsensus,
    cragQb,
    gymQb,
    routeQb,
  };
}

describe('SearchMapDto validation', () => {
  it('accepts an ordinary search term', async () => {
    const errors = await validate(plainToInstance(SearchMapDto, { q: 'wall' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty term rather than ILIKE-ing the whole dataset', async () => {
    const errors = await validate(plainToInstance(SearchMapDto, { q: '' }));
    expect(errors.some((e) => e.property === 'q')).toBe(true);
  });

  it('rejects a term longer than any name column can hold', async () => {
    const errors = await validate(
      plainToInstance(SearchMapDto, { q: 'x'.repeat(101) }),
    );
    expect(errors.some((e) => e.property === 'q')).toBe(true);
  });

  it('rejects a missing term', async () => {
    const errors = await validate(plainToInstance(SearchMapDto, {}));
    expect(errors.some((e) => e.property === 'q')).toBe(true);
  });
});

describe('MapService.findMapPins', () => {
  it('returns crags and gyms in one list, each tagged with its kind', async () => {
    const { service } = makeService({ crags: [CRAG], gyms: [UNVERIFIED_GYM] });

    const pins = await service.findMapPins();

    expect(pins).toEqual([
      {
        id: CRAG.id,
        kind: 'CRAG',
        name: 'The Great Wall',
        latitude: 37.7338,
        longitude: -119.5676,
        status: LifecycleStatus.VERIFIED,
      },
      {
        id: UNVERIFIED_GYM.id,
        kind: 'GYM',
        name: 'Vertical Edge Climbing Gym',
        latitude: 42.8864,
        longitude: -78.8784,
        status: LifecycleStatus.UNVERIFIED,
      },
    ]);
  });

  it('flips GeoJSON [lng, lat] back into named latitude/longitude fields', async () => {
    const { service } = makeService({ crags: [CRAG] });
    const [pin] = await service.findMapPins();
    // The stored coordinates array is [-119.5676, 37.7338] -- getting these
    // the wrong way round is the single easiest bug to ship here, so it is
    // asserted on its own rather than only inside the shape test above.
    expect(pin.latitude).toBe(37.7338);
    expect(pin.longitude).toBe(-119.5676);
  });

  it('keeps UNVERIFIED rows in the result -- BL-020 renders them, it does not hide them', async () => {
    const { service } = makeService({ gyms: [UNVERIFIED_GYM] });
    const pins = await service.findMapPins();
    expect(pins.map((p) => p.status)).toEqual([LifecycleStatus.UNVERIFIED]);
  });

  it('filters ARCHIVED crags and requires a surviving child route (AR-14/AR-17)', async () => {
    const { service, cragQb } = makeService({ crags: [] });
    await service.findMapPins();

    const clauses = cragQb.calls.map(([clause]) => clause);
    expect(
      clauses.some((c) => c.includes('"crag"."status" <> :archived')),
    ).toBe(true);
    expect(
      clauses.some((c) => c.includes('EXISTS') && c.includes('"routes"')),
    ).toBe(true);
    expect(
      cragQb.calls.every(
        ([, params]) =>
          params === undefined ||
          (params as { archived: LifecycleStatus }).archived ===
            LifecycleStatus.ARCHIVED,
      ),
    ).toBe(true);
  });

  it('filters ARCHIVED gyms with no EXISTS clause -- a gym has no child rows', async () => {
    const { service, gymQb } = makeService({ gyms: [] });
    await service.findMapPins();

    expect(gymQb.calls).toHaveLength(1);
    expect(gymQb.calls[0][0]).toContain('"gym"."status" <> :archived');
  });

  it('returns an empty list when nothing is visible', async () => {
    const { service } = makeService({});
    await expect(service.findMapPins()).resolves.toEqual([]);
  });
});

describe('MapService.getCragDetail', () => {
  it('returns the crag with its routes, grades and verification progress', async () => {
    const { service } = makeService({
      findOneResult: CRAG,
      routes: [ROUTE],
      queryResult: [{ route_id: ROUTE.id, verification_count: '2' }],
    });

    const detail = await service.getCragDetail(CRAG.id);

    expect(detail.kind).toBe('CRAG');
    expect(detail.name).toBe('The Great Wall');
    expect(detail.latitude).toBe(37.7338);
    expect(detail.routes).toHaveLength(1);
    expect(detail.routes[0]).toMatchObject({
      id: ROUTE.id,
      name: 'Solar Power',
      discipline: OutdoorDiscipline.SPORT_CLIMBING,
      gearRequirements: [GearRequirement.QUICKDRAWS, GearRequirement.HELMET],
      boltCount: 12,
      minRopeLengthM: 60,
      grade: CONSENSUS,
      verificationCount: 2,
      verificationsRequired: VERIFICATIONS_REQUIRED_TO_VERIFY,
    });
  });

  it('reuses GradeVoteService.computeConsensus rather than re-deriving plurality', async () => {
    const { service, computeConsensus } = makeService({
      findOneResult: CRAG,
      routes: [ROUTE],
    });

    await service.getCragDetail(CRAG.id);

    expect(computeConsensus).toHaveBeenCalledTimes(1);
    expect(computeConsensus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'default-manager' }),
      ROUTE,
    );
  });

  it('reports 0 verifications for a route with no rows in route_verifications', async () => {
    const { service } = makeService({
      findOneResult: CRAG,
      routes: [ROUTE],
      queryResult: [],
    });

    const detail = await service.getCragDetail(CRAG.id);
    expect(detail.routes[0].verificationCount).toBe(0);
  });

  it('skips the verification count query entirely when a crag has no visible routes', async () => {
    const { service, query } = makeService({ findOneResult: CRAG, routes: [] });

    const detail = await service.getCragDetail(CRAG.id);

    expect(detail.routes).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('excludes ARCHIVED routes from the panel', async () => {
    const { service, routeQb } = makeService({
      findOneResult: CRAG,
      routes: [],
    });
    await service.getCragDetail(CRAG.id);

    const clauses = routeQb.calls.map(([clause]) => clause);
    expect(
      clauses.some((c) => c.includes('"route"."status" <> :archived')),
    ).toBe(true);
  });

  it('404s on an unknown crag', async () => {
    const { service } = makeService({ findOneResult: null });
    await expect(service.getCragDetail(CRAG.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s on an ARCHIVED crag rather than rendering a dead panel', async () => {
    const { service } = makeService({
      findOneResult: { ...CRAG, status: LifecycleStatus.ARCHIVED },
    });
    await expect(service.getCragDetail(CRAG.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('defaults a null gear_requirements array to an empty list (BL-023 renders no icons, not placeholders)', async () => {
    const { service } = makeService({
      findOneResult: CRAG,
      routes: [{ ...ROUTE, gearRequirements: null }],
    });

    const detail = await service.getCragDetail(CRAG.id);
    expect(detail.routes[0].gearRequirements).toEqual([]);
  });
});

describe('MapService.getGymDetail', () => {
  it('returns disciplines instead of a route list (Foundation §4)', async () => {
    const { service } = makeService({ findOneResult: UNVERIFIED_GYM });

    const detail = await service.getGymDetail(UNVERIFIED_GYM.id);

    expect(detail).toEqual({
      id: UNVERIFIED_GYM.id,
      kind: 'GYM',
      name: 'Vertical Edge Climbing Gym',
      latitude: 42.8864,
      longitude: -78.8784,
      status: LifecycleStatus.UNVERIFIED,
      disciplinesOffered: [GymDiscipline.BOULDERING, GymDiscipline.LEAD],
    });
  });

  it('defaults a null disciplines_offered array to an empty list', async () => {
    const { service } = makeService({
      findOneResult: { ...UNVERIFIED_GYM, disciplinesOffered: null },
    });
    const detail = await service.getGymDetail(UNVERIFIED_GYM.id);
    expect(detail.disciplinesOffered).toEqual([]);
  });

  it('404s on an unknown gym', async () => {
    const { service } = makeService({ findOneResult: null });
    await expect(
      service.getGymDetail(UNVERIFIED_GYM.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s on an ARCHIVED gym', async () => {
    const { service } = makeService({
      findOneResult: { ...UNVERIFIED_GYM, status: LifecycleStatus.ARCHIVED },
    });
    await expect(
      service.getGymDetail(UNVERIFIED_GYM.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MapService.searchByName', () => {
  const row = {
    id: ROUTE.id,
    kind: 'ROUTE' as const,
    name: 'Solar Power',
    latitude: '37.734',
    longitude: '-119.5679',
    status: LifecycleStatus.UNVERIFIED,
    crag_id: CRAG.id,
  };

  it('maps rows into fly-to-able results, carrying cragId for ROUTE hits', async () => {
    const { service } = makeService({ queryResult: [row] });

    await expect(service.searchByName('solar')).resolves.toEqual([
      {
        id: ROUTE.id,
        kind: 'ROUTE',
        name: 'Solar Power',
        latitude: 37.734,
        longitude: -119.5679,
        status: LifecycleStatus.UNVERIFIED,
        cragId: CRAG.id,
      },
    ]);
  });

  it('wraps the term in ILIKE wildcards', async () => {
    const { service, query } = makeService({ queryResult: [] });
    await service.searchByName('wall');
    expect(query.mock.calls[0][1]).toEqual(['%wall%']);
  });

  it('trims surrounding whitespace before matching', async () => {
    const { service, query } = makeService({ queryResult: [] });
    await service.searchByName('  wall  ');
    expect(query.mock.calls[0][1]).toEqual(['%wall%']);
  });

  it('escapes LIKE metacharacters so "100%" is a literal search, not a wildcard', async () => {
    const { service, query } = makeService({ queryResult: [] });
    await service.searchByName('100%');
    expect(query.mock.calls[0][1]).toEqual(['%100\\%%']);
  });

  it('short-circuits a whitespace-only term without touching the database', async () => {
    const { service, query } = makeService({ queryResult: [] });
    await expect(service.searchByName('   ')).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('searches routes, crags and gyms in one statement and excludes ARCHIVED rows', async () => {
    const { service, query } = makeService({ queryResult: [] });
    await service.searchByName('wall');

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM "routes"');
    expect(sql).toContain('FROM "crags"');
    expect(sql).toContain('FROM "gyms"');
    expect(sql).toContain('ILIKE $1');
    expect(sql.match(/<> 'ARCHIVED'/g)).toHaveLength(3);
  });

  it('bounds the result set', async () => {
    const { service, query } = makeService({ queryResult: [] });
    await service.searchByName('a');
    expect(query.mock.calls[0][0]).toContain('LIMIT 20');
  });

  it('leaves cragId null for CRAG and GYM hits', async () => {
    const { service } = makeService({
      queryResult: [
        {
          ...row,
          id: CRAG.id,
          kind: 'CRAG',
          name: 'The Great Wall',
          crag_id: null,
        },
      ],
    });
    const [result] = await service.searchByName('wall');
    expect(result.cragId).toBeNull();
  });
});
