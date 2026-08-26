import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Crag } from '../crags/entities/crag.entity';
import { Route } from './entities/route.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import { SubmitRouteDto } from './dto/submit-route.dto';

// Foundation §4 / Architecture §3: a route submission's coordinates are
// checked against EXISTING CRAG locations (not the submitter's own
// position -- BL-006 is not presence-gated the way verification/voting/
// logging are) with PostGIS ST_DWithin on geography(Point,4326). 300m is
// the same proximity radius used throughout Foundation.
const CRAG_PROXIMITY_METERS = 300;

export interface SubmitRouteResult {
  route: Route;
  crag: Crag;
  cragCreated: boolean;
}

@Injectable()
export class RoutesService {
  constructor(private readonly dataSource: DataSource) {}

  // Architecture.md §3 / AR-2: one service-layer transaction implements
  // both branches of Foundation §4's crag-creation rule.
  //   - No existing crag within 300m: 3 statements -- create the crag
  //     (founding_route_id still null), create the route pointing at it,
  //     then back-fill founding_route_id now that the route row exists
  //     (circular FK: crags.founding_route_id -> routes.id, but
  //     routes.crag_id -> crags.id must exist first).
  //   - An existing crag within 300m: 1 statement -- the route attaches as
  //     an ordinary non-founding child; the existing crag's status/
  //     founding_route_id are never touched.
  async submitRoute(
    submittedByUserId: string,
    dto: SubmitRouteDto,
  ): Promise<SubmitRouteResult> {
    return this.dataSource.transaction(async (manager) => {
      const existingCrag = await this.findNearbyCrag(
        manager,
        dto.latitude,
        dto.longitude,
      );

      if (existingCrag) {
        const route = await this.insertRoute(
          manager,
          existingCrag.id,
          submittedByUserId,
          dto,
        );
        return { route, crag: existingCrag, cragCreated: false };
      }

      const cragRepo = manager.getRepository(Crag);
      const newCrag = await cragRepo.save(
        cragRepo.create({
          // AR-14: the submission form has no separate "crag name" field
          // (Foundation §4's field list is route-only) -- the auto-created
          // crag borrows its founding route's name.
          name: dto.name,
          location: {
            type: 'Point',
            coordinates: [dto.longitude, dto.latitude],
          },
          status: LifecycleStatus.UNVERIFIED,
          foundingRouteId: null,
          createdBy: submittedByUserId,
        }),
      );

      const route = await this.insertRoute(
        manager,
        newCrag.id,
        submittedByUserId,
        dto,
      );

      newCrag.foundingRouteId = route.id;
      const foundedCrag = await cragRepo.save(newCrag);

      return { route, crag: foundedCrag, cragCreated: true };
    });
  }

  // AR-14: no dedicated map-query filtering service exists yet (that's
  // BL-019-023, Sprint 2's Map & Search epic) -- this is the minimal query
  // BL-006's own AC requires: a crag with zero non-archived routes must
  // never surface. Expected to be superseded/absorbed by a fuller map
  // query service once Epic 4 lands.
  //
  // AR-17 / BL-013: the crag.status <> ARCHIVED clause was added alongside
  // the archival job. Without it, a crag the archival job has explicitly
  // cascaded to ARCHIVED (its founding route archived) could still surface
  // here if a non-founding sibling route under it happens to remain
  // VERIFIED/UNVERIFIED (the documented edge case, Foundation §4/§21 risk
  // 8, TestInventory §3.3's 4th scenario) -- the EXISTS clause alone only
  // ever looks at child route statuses, never the crag's own. Both
  // conditions are needed for different cases: EXISTS catches a crag whose
  // status never itself transitioned but whose routes were archived one by
  // one (BL-006's original case); crag.status <> ARCHIVED catches a crag
  // explicitly cascaded to ARCHIVED even while a sibling route stays
  // reachable in its own right.
  async findVisibleCrags(): Promise<Crag[]> {
    return this.dataSource
      .getRepository(Crag)
      .createQueryBuilder('crag')
      .where('"crag"."status" <> :archived', {
        archived: LifecycleStatus.ARCHIVED,
      })
      .andWhere(
        `EXISTS (SELECT 1 FROM "routes" r WHERE r."crag_id" = "crag"."id" AND r."status" <> :archived)`,
        { archived: LifecycleStatus.ARCHIVED },
      )
      .getMany();
  }

  private async findNearbyCrag(
    manager: EntityManager,
    latitude: number,
    longitude: number,
  ): Promise<Crag | null> {
    // Nearest-first (ORDER BY ST_Distance) in case more than one crag falls
    // within the 300m radius -- undocumented in Architecture/Foundation,
    // flagged as AR-14's tie-break judgment call.
    return manager
      .getRepository(Crag)
      .createQueryBuilder('crag')
      .where(
        `ST_DWithin("crag"."location", ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)`,
        { lng: longitude, lat: latitude, radius: CRAG_PROXIMITY_METERS },
      )
      .orderBy(
        `ST_Distance("crag"."location", ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)`,
        'ASC',
      )
      .getOne();
  }

  private async insertRoute(
    manager: EntityManager,
    cragId: string,
    submittedByUserId: string,
    dto: SubmitRouteDto,
  ): Promise<Route> {
    const routeRepo = manager.getRepository(Route);
    return routeRepo.save(
      routeRepo.create({
        cragId,
        name: dto.name,
        location: { type: 'Point', coordinates: [dto.longitude, dto.latitude] },
        discipline: dto.discipline,
        gearRequirements: dto.gearRequirements ?? [],
        summary: dto.summary,
        proposedGradeOrdinal: dto.proposedGradeOrdinal,
        boltCount: dto.boltCount ?? null,
        minRopeLengthM: dto.minRopeLengthM ?? null,
        status: LifecycleStatus.UNVERIFIED,
        submittedBy: submittedByUserId,
      }),
    );
  }
}
