import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Route } from '../routes/entities/route.entity';
import { RouteGradeVote } from '../verifications/entities/route-grade-vote.entity';
import { VoteOnGradeDto } from './dto/vote-on-grade.dto';
import {
  ProximityLocation,
  STANDARD_PROXIMITY_METERS,
  isWithinProximity,
} from '../common/geo/route-proximity.util';

// Foundation §6: "Once the 4 verification votes exist, consensus replaces
// the proposed grade permanently." The first 4 votes always arrive via
// BL-009's verification flow (each verification requires a grade vote);
// this constant is the same "4" as VerificationService's
// VERIFICATIONS_REQUIRED_TO_VERIFY, but kept as its own local constant
// here rather than imported cross-module, since the two counts are
// conceptually independent even though they currently share a value (a
// route's verification count and its grade-vote count happen to move in
// lockstep only because every verification submission also casts a vote --
// BL-015's standalone votes don't touch route_verifications at all).
const VOTES_REQUIRED_FOR_CONSENSUS = 4;

export interface GradeDistributionEntry {
  gradeOrdinal: number;
  voteCount: number;
}

export interface GradeConsensusResult {
  source: 'PROPOSED' | 'CONSENSUS';
  gradeOrdinal: number;
  totalVotes: number;
  distribution: GradeDistributionEntry[];
}

// Architecture.md AR-18: BL-015 (standalone "Vote on Grade") and BL-016
// (plurality consensus + Proposed Grade display) both live on this one
// service, mirroring how VerificationService already hosts both the route
// and gym verification paths rather than splitting into one class per
// story.
//
// AR-18 design note -- deliberately NOT gated on "have 4 verification
// votes already been cast": Foundation §6 says a standalone vote action
// "appears" once 4 votes exist, and BL-015's Trello card repeats that
// phrasing, but neither TestInventory's grade-consensus.feature scenario
// list nor BL-015's own acceptance criteria (proximity + upsert-on-return-
// visit, nothing else) test any such precondition. "Appears" reads as a
// frontend affordance (a button becoming visible once seeding is
// enabled), not a backend precondition -- and it can't be a real backend
// distinction anyway, since a standalone vote and a verification-sourced
// vote write to the exact identical (route_id, voter_user_id) upsert
// target with no column that would tell them apart after the fact. This
// service accepts a vote from any Verified Climber within 300m at any
// time, regardless of how many votes already exist. Same reasoning
// applies to self-exclusion: unlike verification (which confirms physical
// proof a route exists), grading is an opinion about difficulty a
// submitter can revise later just like anyone else, and it's untested/
// unmandated either way -- no self-exclusion is enforced here.
@Injectable()
export class GradeVoteService {
  constructor(private readonly dataSource: DataSource) {}

  async voteOnGrade(
    routeId: string,
    voterUserId: string,
    dto: VoteOnGradeDto,
    location: ProximityLocation,
  ): Promise<GradeConsensusResult> {
    return this.dataSource.transaction(async (manager) => {
      const routeRepo = manager.getRepository(Route);
      const route = await routeRepo.findOne({ where: { id: routeId } });
      if (!route) {
        throw new NotFoundException(`Route "${routeId}" not found`);
      }

      const withinRange = await isWithinProximity(
        manager,
        'routes',
        routeId,
        location,
        STANDARD_PROXIMITY_METERS,
      );
      if (!withinRange) {
        throw new ForbiddenException(
          `Voter must be within ${STANDARD_PROXIMITY_METERS}m of the route`,
        );
      }

      // AR-4 / BL-015: the exact same upsert target the verification flow
      // already writes to (route_id, voter_user_id) -- a return-visit vote
      // replaces the row instead of colliding with the composite PK.
      await manager
        .createQueryBuilder()
        .insert()
        .into(RouteGradeVote)
        .values({
          routeId,
          voterUserId,
          gradeOrdinal: dto.gradeOrdinal,
        })
        .orUpdate(['grade_ordinal'], ['route_id', 'voter_user_id'])
        .execute();

      return this.computeConsensus(manager, route);
    });
  }

  async getGradeConsensus(routeId: string): Promise<GradeConsensusResult> {
    const route = await this.dataSource
      .getRepository(Route)
      .findOne({ where: { id: routeId } });
    if (!route) {
      throw new NotFoundException(`Route "${routeId}" not found`);
    }
    return this.computeConsensus(this.dataSource.manager, route);
  }

  // Public (not private): also called by ClimbLogsService to snapshot
  // whatever grade is currently displayed at the moment a climb is
  // logged (BL-017's grade_snapshot_ordinal), sharing this exact
  // computation rather than re-deriving it -- Foundation §7's "current
  // consensus grade snapshotted" and §6's plurality/Proposed-Grade rule
  // are the same rule from two different callers' point of view.
  async computeConsensus(
    manager: EntityManager,
    route: Route,
  ): Promise<GradeConsensusResult> {
    // GROUP BY ... ORDER BY COUNT(*) DESC, grade_ordinal ASC -- the ASC
    // tiebreak on grade_ordinal is what implements "ties resolve to the
    // lower grade" (Architecture §4, Foundation §6). COUNT(*) comes back
    // as a string from node-postgres (bigint), hence the Number() below.
    const rows: Array<{ grade_ordinal: number; vote_count: string }> =
      await manager.query(
        `SELECT "grade_ordinal", COUNT(*) AS vote_count
         FROM "route_grade_votes"
         WHERE "route_id" = $1::uuid
         GROUP BY "grade_ordinal"
         ORDER BY COUNT(*) DESC, "grade_ordinal" ASC`,
        [route.id],
      );

    const distribution: GradeDistributionEntry[] = rows.map((r) => ({
      gradeOrdinal: r.grade_ordinal,
      voteCount: Number(r.vote_count),
    }));
    const totalVotes = distribution.reduce((sum, d) => sum + d.voteCount, 0);

    if (totalVotes < VOTES_REQUIRED_FOR_CONSENSUS) {
      // Foundation §6: the submitter's own estimate, display-only, never
      // itself written to route_grade_votes.
      return {
        source: 'PROPOSED',
        gradeOrdinal: route.proposedGradeOrdinal,
        totalVotes,
        distribution,
      };
    }

    return {
      source: 'CONSENSUS',
      gradeOrdinal: distribution[0].gradeOrdinal,
      totalVotes,
      distribution,
    };
  }
}
