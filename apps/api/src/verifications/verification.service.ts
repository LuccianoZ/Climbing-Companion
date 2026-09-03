import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Route } from '../routes/entities/route.entity';
import { Crag } from '../crags/entities/crag.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { RouteVerification } from './entities/route-verification.entity';
import { RouteGradeVote } from './entities/route-grade-vote.entity';
import { GymVerification } from './entities/gym-verification.entity';
import { GymInformationDispute } from './entities/gym-information-dispute.entity';
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
  // 'CONFIRMED' -> a gym_verifications row was written (informationAccurate
  // true); 'DISPUTED' -> a gym_information_disputes row was written instead
  // (informationAccurate false), and none of the verification-count logic
  // ran.
  outcome: 'CONFIRMED' | 'DISPUTED';
  verification: GymVerification | null;
  dispute: GymInformationDispute | null;
  gym: Gym;
  gymNewlyVerified: boolean;
}

export interface GymDisputeQueueItem {
  id: string;
  gymId: string;
  gymName: string;
  reporterUserId: string;
  detail: string;
  createdAt: string;
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

  // BL-011 + Sept 3 revision (AR-51, BL-x06): the gym analog of
  // submitRouteVerification, rewritten as a confirm/dispute step.
  //
  //   - "Yes, accurate" (informationAccurate true): writes a
  //     gym_verifications row and re-runs the >= 4 count -- the 4th flips
  //     the gym to VERIFIED. The photo is OPTIONAL now, and disciplines are
  //     never touched here (gyms.disciplines_offered is set once at
  //     submission -- the AR-17 union-on-4th-verification step is DELETED).
  //   - "No" (informationAccurate false): writes a gym_information_disputes
  //     row for the Admin Dashboard and returns without advancing the
  //     count -- a dispute is not a verification.
  //
  // Same gating shape as before -- not-found, self-exclusion, proximity,
  // duplicate-race -- with one difference: a "No" answer is still allowed
  // against an already-VERIFIED gym (its information can still be wrong),
  // whereas a "Yes" against a VERIFIED gym is a no-op conflict.
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
      // self-exclusion rules as routes." Applies to a dispute too -- you
      // must be at the gym to say its information is wrong.
      if (gym.submittedBy === verifierUserId) {
        throw new ForbiddenException(
          'The original submitter cannot confirm or dispute their own gym',
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
          `You must be within ${VERIFICATION_PROXIMITY_METERS}m of the gym`,
        );
      }

      if (dto.informationAccurate === false) {
        const disputeRepo = manager.getRepository(GymInformationDispute);
        const dispute = await disputeRepo.save(
          disputeRepo.create({
            gymId,
            reporterUserId: verifierUserId,
            detail: (dto.disputeDetail ?? '').trim(),
            resolvedAt: null,
          }),
        );
        return {
          outcome: 'DISPUTED' as const,
          verification: null,
          dispute,
          gym,
          gymNewlyVerified: false,
        };
      }

      if (gym.status === LifecycleStatus.VERIFIED) {
        throw new ConflictException(
          'This gym is already VERIFIED; re-confirmation is unavailable',
        );
      }

      const verificationRepo = manager.getRepository(GymVerification);
      let verification: GymVerification;
      try {
        verification = await verificationRepo.save(
          verificationRepo.create({
            gymId,
            verifierUserId,
            mediaAssetId: dto.mediaAssetId ?? null,
            disciplinesSubmitted: null,
          }),
        );
      } catch (err) {
        // UNIQUE (verifier_user_id, gym_id) -- same clean-4xx-not-500
        // treatment as the route path's duplicate check.
        if (this.isUniqueViolation(err)) {
          throw new ConflictException('You have already confirmed this gym');
        }
        throw err;
      }

      const verificationCount = await verificationRepo.count({
        where: { gymId },
      });

      let gymNewlyVerified = false;
      let updatedGym = gym;

      if (verificationCount >= VERIFICATIONS_REQUIRED_TO_VERIFY) {
        gym.status = LifecycleStatus.VERIFIED;
        gym.verifiedAt = new Date();
        updatedGym = await gymRepo.save(gym);
        gymNewlyVerified = true;
      }

      return {
        outcome: 'CONFIRMED' as const,
        verification,
        dispute: null,
        gym: updatedGym,
        gymNewlyVerified,
      };
    });
  }

  // BL-x08 / Foundation §14: the Admin Dashboard's gym-information dispute
  // queue -- every open (unresolved) row, oldest first, joined to its gym's
  // name for display. Backed by the partial index
  // IDX_gym_information_disputes_open.
  async listOpenGymDisputes(): Promise<GymDisputeQueueItem[]> {
    const rows: Array<{
      id: string;
      gym_id: string;
      gym_name: string;
      reporter_user_id: string;
      detail: string;
      created_at: Date;
    }> = await this.dataSource.query(
      `SELECT d."id", d."gym_id", g."name" AS gym_name,
              d."reporter_user_id", d."detail", d."created_at"
         FROM "gym_information_disputes" d
         JOIN "gyms" g ON g."id" = d."gym_id"
        WHERE d."resolved_at" IS NULL
        ORDER BY d."created_at" ASC`,
    );
    return rows.map((r) => ({
      id: r.id,
      gymId: r.gym_id,
      gymName: r.gym_name,
      reporterUserId: r.reporter_user_id,
      detail: r.detail,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  // BL-x08: resolving a dispute just stamps resolved_at -- whether the admin
  // applied a correction (adminUpdateGym, BL-x07) or dismissed it is not
  // distinguished (MVP: §14 force-archive and admin edits carry no reason
  // row either). Idempotent: a second resolve is a no-op.
  async resolveGymDispute(
    disputeId: string,
  ): Promise<{ id: string; resolvedAt: string; alreadyResolved: boolean }> {
    const repo = this.dataSource.getRepository(GymInformationDispute);
    const dispute = await repo.findOne({ where: { id: disputeId } });
    if (!dispute) {
      throw new NotFoundException(`Dispute "${disputeId}" not found`);
    }
    if (dispute.resolvedAt) {
      return {
        id: dispute.id,
        resolvedAt: dispute.resolvedAt.toISOString(),
        alreadyResolved: true,
      };
    }
    dispute.resolvedAt = new Date();
    await repo.save(dispute);
    return {
      id: dispute.id,
      resolvedAt: dispute.resolvedAt.toISOString(),
      alreadyResolved: false,
    };
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

  // BL-029 (never cut) / Foundation §5: "If the admin rejects a verification
  // photo, that verification is voided (decrementing the count, reverting
  // verified -> unverified if it drops below 4)". This is the reverse of the
  // forward path submitRouteVerification takes -- and the reason that path's
  // 4-count check was written as a re-runnable `>= 4` query rather than an
  // `=== 4` increment (see VERIFICATIONS_REQUIRED_TO_VERIFY, AR-16).
  //
  // Runs inside the caller's (ModerationService's) transaction so the void,
  // the strike, the crag reversal and the notification all commit or roll
  // back together. Called with the rejected photo's id -- the verification
  // row is found by its media_asset_id.
  //
  // The route_grade_votes row this verification upserted (AR-4) is
  // deliberately NOT deleted: a grade opinion cast by someone physically at
  // the route is a separate concern from the photo's authenticity, and
  // GradeVoteService.computeConsensus already falls back to "Proposed Grade"
  // once a route is back under 4 votes -- see AR-46. The archival window is
  // also untouched: §5 says a revert does not restart the clock, and it
  // stays anchored to the route's original created_at.
  async voidRouteVerificationByPhoto(
    manager: EntityManager,
    mediaAssetId: string,
  ): Promise<{
    voided: boolean;
    routeReverted: boolean;
    cragReverted: boolean;
    routeId: string | null;
  }> {
    const verificationRepo = manager.getRepository(RouteVerification);
    const verification = await verificationRepo.findOne({
      where: { mediaAssetId },
    });
    if (!verification) {
      return {
        voided: false,
        routeReverted: false,
        cragReverted: false,
        routeId: null,
      };
    }

    const { routeId } = verification;
    await verificationRepo.remove(verification);

    const remaining = await verificationRepo.count({ where: { routeId } });

    let routeReverted = false;
    let cragReverted = false;

    const routeRepo = manager.getRepository(Route);
    const route = await routeRepo.findOne({ where: { id: routeId } });
    if (
      route &&
      route.status === LifecycleStatus.VERIFIED &&
      remaining < VERIFICATIONS_REQUIRED_TO_VERIFY
    ) {
      route.status = LifecycleStatus.UNVERIFIED;
      route.verifiedAt = null;
      await routeRepo.save(route);
      routeReverted = true;

      // The mirror of the §4 forward cascade: a founding route reverting
      // drags its crag back to UNVERIFIED too, even if a non-founding
      // sibling route is independently VERIFIED (Foundation §4/§21 risk 8).
      const cragRepo = manager.getRepository(Crag);
      const crag = await cragRepo.findOne({ where: { id: route.cragId } });
      if (
        crag &&
        crag.foundingRouteId === route.id &&
        crag.status === LifecycleStatus.VERIFIED
      ) {
        crag.status = LifecycleStatus.UNVERIFIED;
        crag.verifiedAt = null;
        await cragRepo.save(crag);
        cragReverted = true;
      }
    }

    return { voided: true, routeReverted, cragReverted, routeId };
  }

  // AR-47: the same void, for a rejected GYM-verification photo. BL-029 is
  // titled route-only, but Foundation §5's "that verification is voided"
  // language is not route-qualified, and a rejected gym photo still counting
  // toward the gym's 4 is the identical correctness hole. No crag cascade --
  // gyms have no crag.
  //
  // Post-Sept-3 (BL-x06) the photo is optional, so most gym_verifications
  // rows carry no media_asset_id at all -- findOne({ where: { mediaAssetId }})
  // simply won't match those, which is exactly right: a rejected photo can
  // only void the one confirmation that was actually backed by it.
  // `disciplines_offered` is never touched here -- it is set once at
  // submission (BL-x04) and verification no longer collects it.
  async voidGymVerificationByPhoto(
    manager: EntityManager,
    mediaAssetId: string,
  ): Promise<{
    voided: boolean;
    gymReverted: boolean;
    gymId: string | null;
  }> {
    const verificationRepo = manager.getRepository(GymVerification);
    const verification = await verificationRepo.findOne({
      where: { mediaAssetId },
    });
    if (!verification) {
      return { voided: false, gymReverted: false, gymId: null };
    }

    const { gymId } = verification;
    await verificationRepo.remove(verification);

    const remaining = await verificationRepo.count({ where: { gymId } });

    let gymReverted = false;
    const gymRepo = manager.getRepository(Gym);
    const gym = await gymRepo.findOne({ where: { id: gymId } });
    if (
      gym &&
      gym.status === LifecycleStatus.VERIFIED &&
      remaining < VERIFICATIONS_REQUIRED_TO_VERIFY
    ) {
      gym.status = LifecycleStatus.UNVERIFIED;
      gym.verifiedAt = null;
      await gymRepo.save(gym);
      gymReverted = true;
    }

    return { voided: true, gymReverted, gymId };
  }
}
