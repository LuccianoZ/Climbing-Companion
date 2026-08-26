import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Route } from '../routes/entities/route.entity';
import { Crag } from '../crags/entities/crag.entity';
import { Gym, GymDiscipline } from '../gyms/entities/gym.entity';
import { RouteVerification } from './entities/route-verification.entity';
import { RouteGradeVote } from './entities/route-grade-vote.entity';
import { GymVerification } from './entities/gym-verification.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import { SubmitRouteVerificationDto } from './dto/submit-route-verification.dto';
import { SubmitGymVerificationDto } from './dto/submit-gym-verification.dto';

// Architecture.md §4 / Foundation §5: the verifier's own physical location
// must be within this radius of the thing being verified, mirroring the
// 300m constant used throughout Foundation (crag proximity, gym check-in,
// grade voting, climb logging). Shared by both submitRouteVerification and
// submitGymVerification (Architecture.md AR-17 -- gym verification is
// "subject to the same 300m ... rules as routes", TestInventory) -- unlike
// RoutesService's CRAG_PROXIMITY_METERS (which checks submitted coordinates
// against existing crags), this checks the *verifying user's own* GPS
// position -- see AR-16.
const VERIFICATION_PROXIMITY_METERS = 300;

// Architecture.md §4: "if COUNT(*) over this route's verifications now =
// 4 ...". Checked as >= rather than === so the count check stays a
// re-runnable query rather than something that only ever increments --
// BL-029 (Sprint 3) will later delete a verification row on admin
// rejection and re-run this same check to decide whether to revert
// VERIFIED -> UNVERIFIED; a strict === would make that future re-check
// (recomputing count after a delete, not just after an insert) awkward to
// share with this path. Shared by the gym path (BL-011), which uses the
// identical 4-verifier gate.
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

export interface SubmitGymVerificationResult {
  verification: GymVerification;
  gym: Gym;
  gymNewlyVerified: boolean;
}

// Architecture.md §9: both submitRouteVerification (BL-009) and
// submitGymVerification (BL-011) live on this one service, per Architecture
// §9's explicit listing of both methods on VerificationService rather than
// a separate GymVerificationService class.
//
// Architecture.md AR-17: the proximity check ("is this verifier's own
// location within 300m of the thing they're verifying") is now shared by
// both methods via isWithinRange() below, parameterized by table name --
// worth extracting now that a second raw-SQL call site exists inside this
// same class (the handoff's flagged "third call site" was actually two:
// this one plus RoutesService.findNearbyCrag, but that one uses TypeORM's
// query *builder* over a different table's shape -- crag proximity for
// submission siting, not a verifying user's own position -- so it stays a
// separate, purpose-built query rather than being folded into this one).
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
        'routes',
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

  // Architecture.md §4 / AR-17: BL-011's gym analog of
  // submitRouteVerification above. Materially simpler -- no grade vote, no
  // crag cascade (gyms have no crag relationship, Foundation §4) -- but the
  // same gating shape (not-found, self-exclusion, already-VERIFIED,
  // proximity, duplicate-vote-race) and the same 4-count re-runnable-query
  // reasoning (see VERIFICATIONS_REQUIRED_TO_VERIFY above). On the 4th
  // verification, disciplines_offered is set to a *fresh aggregation* over
  // all four gym_verifications rows (Architecture §4's explicit wording),
  // not an incremental accumulate-as-you-go union.
  async submitGymVerification(
    gymId: string,
    verifierUserId: string,
    dto: SubmitGymVerificationDto,
    verifierLocation: VerifierLocation,
  ): Promise<SubmitGymVerificationResult> {
    return this.dataSource.transaction(async (manager) => {
      const gymRepo = manager.getRepository(Gym);
      const gym = await gymRepo.findOne({ where: { id: gymId } });
      if (!gym) {
        throw new NotFoundException(`Gym "${gymId}" not found`);
      }

      // TestInventory: "Gym verification is subject to the same 300m and
      // self-exclusion rules as routes."
      if (gym.submittedBy === verifierUserId) {
        throw new ForbiddenException(
          'The original submitter cannot verify their own gym',
        );
      }

      if (gym.status === LifecycleStatus.VERIFIED) {
        throw new ConflictException(
          'This gym is already VERIFIED; re-verification is unavailable',
        );
      }

      const withinRange = await this.isWithinRange(
        manager,
        'gyms',
        gymId,
        verifierLocation,
      );
      if (!withinRange) {
        throw new ForbiddenException(
          `Verifier must be within ${VERIFICATION_PROXIMITY_METERS}m of the gym`,
        );
      }

      const verificationRepo = manager.getRepository(GymVerification);
      let verification: GymVerification;
      try {
        verification = await verificationRepo.save(
          verificationRepo.create({
            gymId,
            verifierUserId,
            mediaAssetId: dto.mediaAssetId,
            disciplinesSubmitted: dto.disciplinesSubmitted,
          }),
        );
      } catch (err) {
        // UNIQUE (verifier_user_id, gym_id) -- same clean-4xx-not-500
        // treatment as the route path's duplicate check.
        if (this.isUniqueViolation(err)) {
          throw new ConflictException('You have already verified this gym');
        }
        throw err;
      }

      const verificationCount = await verificationRepo.count({
        where: { gymId },
      });

      let gymNewlyVerified = false;
      let updatedGym = gym;

      if (verificationCount >= VERIFICATIONS_REQUIRED_TO_VERIFY) {
        const disciplinesOffered = await this.unionSubmittedDisciplines(
          manager,
          gymId,
        );
        gym.status = LifecycleStatus.VERIFIED;
        gym.verifiedAt = new Date();
        gym.disciplinesOffered = disciplinesOffered;
        updatedGym = await gymRepo.save(gym);
        gymNewlyVerified = true;
      }

      return { verification, gym: updatedGym, gymNewlyVerified };
    });
  }

  // Architecture §4: "a fresh aggregation query over the 4 rows, not an
  // incremental accumulate-as-you-go" -- re-derives the full union from
  // every gym_verifications row every time the gate trips, rather than
  // merging this single submission's disciplines onto whatever
  // disciplines_offered already held.
  private async unionSubmittedDisciplines(
    manager: EntityManager,
    gymId: string,
  ): Promise<GymDiscipline[]> {
    const rows: Array<{ discipline: GymDiscipline }> = await manager.query(
      `SELECT DISTINCT unnest("disciplines_submitted") AS discipline
       FROM "gym_verifications"
       WHERE "gym_id" = $1::uuid`,
      [gymId],
    );
    return rows.map((r) => r.discipline);
  }

  // Architecture §4 / §19.4: PostGIS ST_DWithin on the geography column,
  // same mandatory-GiST-backed check pattern as RoutesService's
  // findNearbyCrag -- raw SQL against the stored `location` rather than
  // fetching it into JS and reconstructing geography client-side, so the
  // GiST index is actually used and the distance math is PostGIS's
  // geodesic calculation, not an approximation. `table` is never
  // user-supplied -- always one of the two literal values this class
  // passes internally -- so interpolating it into the query text carries no
  // injection risk; it can't be parameterized the normal way since a bind
  // parameter can't stand in for an identifier.
  private async isWithinRange(
    manager: EntityManager,
    table: 'routes' | 'gyms',
    entityId: string,
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
       FROM "${table}"
       WHERE "id" = $4::uuid`,
      [
        location.longitude,
        location.latitude,
        VERIFICATION_PROXIMITY_METERS,
        entityId,
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
