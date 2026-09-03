import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Crag } from '../crags/entities/crag.entity';
import {
  GearRequirement,
  OutdoorDiscipline,
  Route,
} from './entities/route.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import { MediaPurpose } from '../media/entities/media-asset.entity';
import {
  isWithinProximityOfPoint,
  STANDARD_PROXIMITY_METERS,
  type ProximityLocation,
} from '../common/geo/route-proximity.util';
import {
  linkSubmissionPhotos,
  listSubmissionPhotos,
  syncSubmissionPhotos,
  unlinkAllSubmissionPhotos,
  type SubmissionPhotoView,
} from '../common/media/link-submission-photos.util';
import { SubmitRouteDto } from './dto/submit-route.dto';
import { AdminUpdateRouteDto } from './dto/admin-update-route.dto';

// Foundation §4 / Architecture §3: a route submission's coordinates are
// checked against EXISTING CRAG locations (not the submitter's own
// position) with PostGIS ST_DWithin on geography(Point,4326). 300m is the
// same proximity radius used throughout Foundation. Sept 3 revision (BL-x02)
// ADDS a second, separate check: the submitter's own device location vs the
// pin, for non-admins.
const CRAG_PROXIMITY_METERS = 300;

export interface SubmitRouteResult {
  route: Route;
  crag: Crag;
  cragCreated: boolean;
}

export interface SubmitRouteContext {
  // Resolved by the controller (AR-16): X-Test-Mock-GPS, else the DTO's
  // deviceLatitude/deviceLongitude, else the pin coordinates themselves.
  deviceLocation: ProximityLocation;
  isAdmin: boolean;
}

export interface ForceArchiveRouteResult {
  routeId: string;
  routeArchived: boolean;
  cragArchived: boolean;
  alreadyArchived: boolean;
}

// AR-51 BL-x07 (admin data stewardship): the full editable view of a climb,
// including archived ones.
export interface AdminRouteView {
  id: string;
  name: string;
  cragId: string;
  cragName: string | null;
  isFoundingRoute: boolean;
  latitude: number;
  longitude: number;
  discipline: OutdoorDiscipline;
  gearRequirements: GearRequirement[];
  summary: string;
  proposedGradeOrdinal: number;
  boltCount: number | null;
  minRopeLengthM: number | null;
  status: LifecycleStatus;
  photos: SubmissionPhotoView[];
}

export interface HardDeleteRouteResult {
  routeId: string;
  deleted: boolean;
  // A founding route cannot be deleted alone -- its crag has no other
  // possible founding route (§4: "set once and never reassigned"), so the
  // whole crag and every route under it go with it.
  cragDeleted: boolean;
  siblingRoutesDeleted: number;
}

export interface RestoreRouteResult {
  routeId: string;
  restored: boolean;
  cragRestored: boolean;
  alreadyActive: boolean;
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
    context: SubmitRouteContext,
  ): Promise<SubmitRouteResult> {
    // BL-x02 / §19.4: the submitter's-device-vs-pin gate. Skipped for
    // SYSTEM_ADMIN (BL-x03 -- an admin sites climbs from anywhere), enforced
    // server-side for everyone else. The 301m negative test hits this branch.
    if (!context.isAdmin) {
      const inRange = await isWithinProximityOfPoint(
        this.dataSource.manager,
        context.deviceLocation,
        { latitude: dto.latitude, longitude: dto.longitude },
        STANDARD_PROXIMITY_METERS,
      );
      if (!inRange) {
        throw new ForbiddenException(
          `A route pin must be placed within ${STANDARD_PROXIMITY_METERS}m of your current location`,
        );
      }
    }

    // BL-x03: an admin-authored climb is created VERIFIED, and so is any
    // brand-new crag it founds -- in the same transaction, with no cascade
    // step. This is the documented reversal of §4/§18's "the founding-route
    // pipeline is the only path to a verified crag".
    const verified = context.isAdmin;

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
          verified,
        );
        await this.attachPhotos(
          manager,
          route.id,
          submittedByUserId,
          dto,
          verified,
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
          status: verified
            ? LifecycleStatus.VERIFIED
            : LifecycleStatus.UNVERIFIED,
          verifiedAt: verified ? new Date() : null,
          foundingRouteId: null,
          createdBy: submittedByUserId,
        }),
      );

      const route = await this.insertRoute(
        manager,
        newCrag.id,
        submittedByUserId,
        dto,
        verified,
      );

      newCrag.foundingRouteId = route.id;
      const foundedCrag = await cragRepo.save(newCrag);

      await this.attachPhotos(
        manager,
        route.id,
        submittedByUserId,
        dto,
        verified,
      );

      return { route, crag: foundedCrag, cragCreated: true };
    });
  }

  // BL-x07 / Foundation §14: an admin rewrites any field of any outdoor
  // climb from any location, no reason row. Only the fields present in the
  // DTO change. `boltCount` / `minRopeLengthM` accept an explicit null to
  // clear them; `photoMediaIds`, when present, is the full desired photo set
  // (added ids linked+APPROVED, dropped ids unlinked; >= 3 enforced).
  async adminUpdateRoute(
    routeId: string,
    dto: AdminUpdateRouteDto,
    adminUserId: string,
  ): Promise<Route> {
    if ((dto.latitude == null) !== (dto.longitude == null)) {
      throw new BadRequestException(
        'latitude and longitude must be supplied together',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const routeRepo = manager.getRepository(Route);
      const route = await routeRepo.findOne({ where: { id: routeId } });
      if (!route) {
        throw new NotFoundException(`Route "${routeId}" not found`);
      }

      if (dto.name !== undefined) route.name = dto.name;
      if (dto.latitude != null && dto.longitude != null) {
        route.location = {
          type: 'Point',
          coordinates: [dto.longitude, dto.latitude],
        };
      }
      if (dto.discipline !== undefined) route.discipline = dto.discipline;
      if (dto.gearRequirements !== undefined) {
        route.gearRequirements = dto.gearRequirements;
      }
      if (dto.summary !== undefined) route.summary = dto.summary;
      if (dto.proposedGradeOrdinal !== undefined) {
        route.proposedGradeOrdinal = dto.proposedGradeOrdinal;
      }
      if (dto.boltCount !== undefined) route.boltCount = dto.boltCount;
      if (dto.minRopeLengthM !== undefined) {
        route.minRopeLengthM = dto.minRopeLengthM;
      }

      const saved = await routeRepo.save(route);

      if (dto.photoMediaIds !== undefined) {
        await syncSubmissionPhotos({
          manager,
          desiredIds: dto.photoMediaIds,
          ownerUserId: adminUserId,
          purpose: MediaPurpose.ROUTE_SUBMISSION_PHOTO,
          subjectRouteId: routeId,
        });
      }

      return saved;
    });
  }

  // BL-x07: the editor's read. Includes ARCHIVED routes -- an admin may be
  // editing one they are about to restore.
  async getRouteForAdmin(routeId: string): Promise<AdminRouteView> {
    return this.dataSource.transaction(async (manager) => {
      const route = await manager
        .getRepository(Route)
        .findOne({ where: { id: routeId } });
      if (!route) {
        throw new NotFoundException(`Route "${routeId}" not found`);
      }
      const crag = await manager
        .getRepository(Crag)
        .findOne({ where: { id: route.cragId } });
      const photos = await listSubmissionPhotos(manager, { routeId });
      return {
        id: route.id,
        name: route.name,
        cragId: route.cragId,
        cragName: crag?.name ?? null,
        isFoundingRoute: crag?.foundingRouteId === route.id,
        latitude: route.location.coordinates[1],
        longitude: route.location.coordinates[0],
        discipline: route.discipline,
        gearRequirements: route.gearRequirements ?? [],
        summary: route.summary,
        proposedGradeOrdinal: route.proposedGradeOrdinal,
        boltCount: route.boltCount,
        minRopeLengthM: route.minRopeLengthM,
        status: route.status,
        photos,
      };
    });
  }

  // BL-x07 (admin stewardship): the irreversible option. The frontend gates
  // this behind typing "DELETE"; the server just does it. A founding route
  // takes its whole crag (and every sibling route) with it -- see
  // HardDeleteRouteResult. Dependent rows (verifications, grade votes, climb
  // logs) are deleted; submission photos are unlinked, not deleted.
  async hardDeleteRoute(routeId: string): Promise<HardDeleteRouteResult> {
    return this.dataSource.transaction(async (manager) => {
      const routeRepo = manager.getRepository(Route);
      const route = await routeRepo.findOne({ where: { id: routeId } });
      if (!route) {
        throw new NotFoundException(`Route "${routeId}" not found`);
      }

      const cragRepo = manager.getRepository(Crag);
      const crag = await cragRepo.findOne({ where: { id: route.cragId } });
      const isFounding = crag?.foundingRouteId === route.id;

      if (crag && isFounding) {
        const siblings = await routeRepo.find({
          where: { cragId: crag.id },
        });
        const routeIds = siblings.map((r) => r.id);
        await this.deleteRouteDependents(manager, routeIds);
        // Break the circular FK before deleting the routes.
        await manager.query(
          `UPDATE "crags" SET "founding_route_id" = NULL WHERE "id" = $1::uuid`,
          [crag.id],
        );
        await manager.query(`DELETE FROM "routes" WHERE "crag_id" = $1::uuid`, [
          crag.id,
        ]);
        await manager.query(`DELETE FROM "crags" WHERE "id" = $1::uuid`, [
          crag.id,
        ]);
        return {
          routeId,
          deleted: true,
          cragDeleted: true,
          siblingRoutesDeleted: routeIds.length - 1,
        };
      }

      await this.deleteRouteDependents(manager, [routeId]);
      await manager.query(`DELETE FROM "routes" WHERE "id" = $1::uuid`, [
        routeId,
      ]);
      return {
        routeId,
        deleted: true,
        cragDeleted: false,
        siblingRoutesDeleted: 0,
      };
    });
  }

  private async deleteRouteDependents(
    manager: EntityManager,
    routeIds: string[],
  ): Promise<void> {
    if (routeIds.length === 0) return;
    await manager.query(
      `DELETE FROM "route_verifications" WHERE "route_id" = ANY($1::uuid[])`,
      [routeIds],
    );
    await manager.query(
      `DELETE FROM "route_grade_votes" WHERE "route_id" = ANY($1::uuid[])`,
      [routeIds],
    );
    await manager.query(
      `DELETE FROM "climb_logs" WHERE "route_id" = ANY($1::uuid[])`,
      [routeIds],
    );
    await unlinkAllSubmissionPhotos(manager, { routeIds });
  }

  // BL-x07: un-archive. Restores an ARCHIVED route to UNVERIFIED (its
  // pre-archive status is not stored, so it re-enters the verification
  // pipeline). A founding route restore drags its crag back too.
  async restoreRoute(routeId: string): Promise<RestoreRouteResult> {
    return this.dataSource.transaction(async (manager) => {
      const routeRepo = manager.getRepository(Route);
      const route = await routeRepo.findOne({ where: { id: routeId } });
      if (!route) {
        throw new NotFoundException(`Route "${routeId}" not found`);
      }
      if (route.status !== LifecycleStatus.ARCHIVED) {
        return {
          routeId,
          restored: false,
          cragRestored: false,
          alreadyActive: true,
        };
      }

      route.status = LifecycleStatus.UNVERIFIED;
      route.archivedAt = null;
      route.verifiedAt = null;
      await routeRepo.save(route);

      let cragRestored = false;
      const cragRepo = manager.getRepository(Crag);
      const crag = await cragRepo.findOne({ where: { id: route.cragId } });
      if (
        crag &&
        crag.foundingRouteId === route.id &&
        crag.status === LifecycleStatus.ARCHIVED
      ) {
        crag.status = LifecycleStatus.UNVERIFIED;
        crag.archivedAt = null;
        crag.verifiedAt = null;
        await cragRepo.save(crag);
        cragRestored = true;
      }

      return { routeId, restored: true, cragRestored, alreadyActive: false };
    });
  }

  private async attachPhotos(
    manager: EntityManager,
    routeId: string,
    ownerUserId: string,
    dto: SubmitRouteDto,
    approve: boolean,
  ): Promise<void> {
    await linkSubmissionPhotos({
      manager,
      mediaIds: dto.photoMediaIds,
      ownerUserId,
      purpose: MediaPurpose.ROUTE_SUBMISSION_PHOTO,
      subjectRouteId: routeId,
      approve,
    });
  }

  // BL-035 / Foundation §14: force-archive is a data-integrity mutation --
  // no reason row, no accountability record (contrast the four §11 actions).
  // It is the admin's manual equivalent of the time-window archival job:
  // the same terminal ARCHIVED state, and the same founding-route -> crag
  // cascade (Foundation §4, mirrored from ArchivalService.archiveExpiredRoutes
  // and VerificationService's revert path). Unlike the cron job it ignores
  // elapsed time and lifecycle status -- an admin can take down a VERIFIED
  // route just as readily as an UNVERIFIED one. Re-archiving an already
  // ARCHIVED route is a no-op, not an error: the point is that the row ends
  // up hidden, and it already is.
  //
  // BL-x07 reuses this exact method as the "take down" half of admin
  // stewardship -- there is no separate takedown path.
  async forceArchiveRoute(routeId: string): Promise<ForceArchiveRouteResult> {
    return this.dataSource.transaction(async (manager) => {
      const routeRepo = manager.getRepository(Route);
      const route = await routeRepo.findOne({ where: { id: routeId } });
      if (!route) {
        throw new NotFoundException(`Route "${routeId}" not found`);
      }

      if (route.status === LifecycleStatus.ARCHIVED) {
        return {
          routeId,
          routeArchived: false,
          cragArchived: false,
          alreadyArchived: true,
        };
      }

      route.status = LifecycleStatus.ARCHIVED;
      route.archivedAt = new Date();
      await routeRepo.save(route);

      let cragArchived = false;
      const cragRepo = manager.getRepository(Crag);
      const crag = await cragRepo.findOne({ where: { id: route.cragId } });
      if (
        crag &&
        crag.foundingRouteId === route.id &&
        crag.status !== LifecycleStatus.ARCHIVED
      ) {
        crag.status = LifecycleStatus.ARCHIVED;
        crag.archivedAt = new Date();
        await cragRepo.save(crag);
        cragArchived = true;
      }

      return {
        routeId,
        routeArchived: true,
        cragArchived,
        alreadyArchived: false,
      };
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
    verified: boolean,
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
        status: verified
          ? LifecycleStatus.VERIFIED
          : LifecycleStatus.UNVERIFIED,
        verifiedAt: verified ? new Date() : null,
        submittedBy: submittedByUserId,
      }),
    );
  }
}
