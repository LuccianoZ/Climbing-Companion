import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Route } from '../routes/entities/route.entity';
import { Crag } from '../crags/entities/crag.entity';
import { RouteVerification } from './entities/route-verification.entity';
import { RouteGradeVote } from './entities/route-grade-vote.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import { SubmitRouteVerificationDto } from './dto/submit-route-verification.dto';

// Architecture.md §4 / Foundation §5: the verifier's own physical location
// must be within this radius of the route, mirroring the 300m constant
// used throughout Foundation (crag proximity, gym check-in, grade voting,
// climb logging). Unlike RoutesService's CRAG_PROXIMITY_METERS (which
// checks submitted coordinates against existing crags), this checks the
// *verifying user's own* GPS position -- see AR-16.
const VERIFICATION_PROXIMITY_METERS = 300;

// Architecture.md §4: "if COUNT(*) over this route's verifications now = 4,
// flip routes.status -> VERIFIED". Checked as >= rather than === so the
// count check stays a re-runnable query rather than something that only
// ever increments -- BL-029 (Sprint 3) will later delete a verification row
// on admin rejection and re-run this same check to decide whether to
// revert VERIFIED -> UNVERIFIED; a strict === would make that future
// re-check (recomputing count after a delete, not just after an insert)
// awkward to share with this path.
const VERIFICATIONS_REQUIRED_TO_VERIFY = 4;

export interface VerifierLocation {
  latitude: number;
  longitude: number;
}

export interface SubmitRouteVerificationResult {
  verification: RouteVerification;
  route: Route;
  routeNewlyVerified: boolean;
  cragNewlyVerified: boolean;
}

// Architecture.md §9 / §4: the three-part transaction -- insert the
// verification row, upsert the matching route_grade_votes row (AR-4), then
// check the running count and cascade routes.status / crags.status to
// VERIFIED when it hits 4 (BL-010). All gating (self-verification,
// already-VERIFIED, 300m proximity, duplicate-vote) happens inside the same
// transaction as the writes, mirroring RoutesService.submitRoute's shape.
@Injectable()
export class VerificationService {
  constructor(private readonly dataSource: DataSource) {}

  async submitRouteVerification(
    routeId: string,
    verifierUserId: string,
    dto: SubmitRouteVerificationDto,
    verifierLocation: VerifierLocation,
  ): Promise<SubmitRouteVerificationResult> {
    return this.dataSource.transaction(async (manager) => {
      const routeRepo = manager.getRepository(Route);
      const route = await routeRepo.findOne({ where: { id: routeId } });
      if (!route) {
        throw new NotFoundException(`Route "${routeId}" not found`);
      }

      // Foundation §5: the original submitter is excluded from verifying
      // their own route.
      if (route.submittedBy === verifierUserId) {
        throw new ForbiddenException(
          'The original submitter cannot verify their own route',
        );
      }

      // Foundation §5 / Architecture §4: once VERIFIED, the verify action is
      // unavailable for that route going forward (reviews/grade votes
      // remain available -- only re-verification is blocked here).
      if (route.status === LifecycleStatus.VERIFIED) {
        throw new ConflictException(
          'This route is already VERIFIED; re-verification is unavailable',
        );
      }

      const withinRange = await this.isWithinRange(
        manager,
        routeId,
        verifierLocation,
      );
      if (!withinRange) {
        throw new ForbiddenException(
          `Verifier must be within ${VERIFICATION_PROXIMITY_METERS}m of the route`,
        );
      }

      const verificationRepo = manager.getRepository(RouteVerification);
      let verification: RouteVerification;
      try {
        verification = await verificationRepo.save(
          verificationRepo.create({
            routeId,
            verifierUserId,
            mediaAssetId: dto.mediaAssetId,
          }),
        );
      } catch (err) {
        // UNIQUE (verifier_user_id, route_id) -- a user cannot verify the
        // same route twice. Caught here (mirroring AuthService.register's
        // handling of the email UNIQUE violation) rather than pre-checked
        // with a findOne(), so this stays race-safe and surfaces as a clean
        // 4xx instead of a raw Postgres constraint violation leaking as a
        // 500.
        if (this.isUniqueViolation(err)) {
          throw new ConflictException('You have already verified this route');
        }
        throw err;
      }

      // AR-4: the same upsert target a standalone "Vote on Grade" action
      // (Sprint 2, BL-015) will later write to. orUpdate() (not onConflict()
      // -- this TypeORM version doesn't have that method) generates
      // ON CONFLICT (route_id, voter_user_id) DO UPDATE SET grade_ordinal =
      // EXCLUDED.grade_ordinal, so a climber changing their vote on a
      // return visit replaces the row rather than colliding with the PK.
      // Both arguments take raw DB column names, not entity property names
      // -- InsertQueryBuilder.orUpdate() doesn't resolve them through
      // entity metadata. `updated_at` doesn't need to be listed: TypeORM
      // automatically appends `"updated_at" = DEFAULT` for any
      // @UpdateDateColumn not already in the overwrite list.
      await manager
        .createQueryBuilder()
        .insert()
        .into(RouteGradeVote)
        .values({
          routeId,
          voterUserId: verifierUserId,
          gradeOrdinal: dto.gradeOrdinal,
        })
        .orUpdate(['grade_ordinal'], ['route_id', 'voter_user_id'])
        .execute();

      const verificationCount = await verificationRepo.count({
        where: { routeId },
      });

      let routeNewlyVerified = false;
      let cragNewlyVerified = false;
      let updatedRoute = route;

      if (verificationCount >= VERIFICATIONS_REQUIRED_TO_VERIFY) {
        route.status = LifecycleStatus.VERIFIED;
        route.verifiedAt = new Date();
        updatedRoute = await routeRepo.save(route);
        routeNewlyVerified = true;

        // BL-010: the crag cascade is a direct function of whether this
        // route is its crag's founding route -- a non-founding route
        // verifying leaves the crag untouched (Foundation §4/§21 risk 8).
        const cragRepo = manager.getRepository(Crag);
        const crag = await cragRepo.findOne({ where: { id: route.cragId } });
        if (crag && crag.foundingRouteId === route.id) {
          crag.status = LifecycleStatus.VERIFIED;
          crag.verifiedAt = new Date();
          await cragRepo.save(crag);
          cragNewlyVerified = true;
        }
      }

      return {
        verification,
        route: updatedRoute,
        routeNewlyVerified,
        cragNewlyVerified,
      };
    });
  }

  // Architecture §4 / §19.4: PostGIS ST_DWithin on the geography column,
  // same mandatory-GiST-backed check pattern as RoutesService's
  // findNearbyCrag -- raw SQL against the route's stored `location` rather
  // than fetching it into JS and reconstructing geography client-side, so
  // the GiST index is actually used and the distance math is PostGIS's
  // geodesic calculation, not an approximation.
  private async isWithinRange(
    manager: EntityManager,
    routeId: string,
    location: VerifierLocation,
  ): Promise<boolean> {
    // Parameters are explicitly cast (::float8/::uuid) rather than left for
    // Postgres to infer -- manager.query()'s raw parameterized SQL sends
    // numeric bind values with an unresolved type, and some PostGIS
    // functions (e.g. ST_Project, used in features/step-definitions/
    // route-verification.steps.ts) have multiple overloads that match an
    // unresolved-type argument equally well, raising a
    // "function ... is not unique" error. TypeORM's query *builder*
    // (RoutesService.findNearbyCrag) doesn't hit this because it binds
    // parameters differently; raw manager.query() does.
    const rows: Array<{ within: boolean }> = await manager.query(
      `SELECT ST_DWithin(
         "location",
         ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography,
         $3::float8
       ) AS within
       FROM "routes"
       WHERE "id" = $4::uuid`,
      [
        location.longitude,
        location.latitude,
        VERIFICATION_PROXIMITY_METERS,
        routeId,
      ],
    );
    return rows[0]?.within === true;
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: unknown }).code === '23505'
    );
  }
}
