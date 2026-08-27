import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Route } from '../routes/entities/route.entity';
import { GradeVoteService } from '../grade-votes/grade-vote.service';
import { ClimbLog } from './entities/climb-log.entity';
import { LogClimbDto } from './dto/log-climb.dto';
import {
  ProximityLocation,
  STANDARD_PROXIMITY_METERS,
  isWithinProximity,
} from '../common/geo/route-proximity.util';

// Architecture.md AR-18: BL-017 (Log Completed/Attempted) and BL-018
// (repeat logging, no uniqueness) are one method -- "two actions,
// identical mechanics, only outcome differs" (Trello-Reference.docx) means
// there's nothing for BL-018 to add beyond "don't add a uniqueness
// constraint", which is simply the absence of one on the ClimbLog entity
// (see its own comment) rather than any extra service logic.
//
// AR-18: logging is intentionally NOT gated on the route's lifecycle_status
// (UNVERIFIED/VERIFIED/ARCHIVED) -- neither Foundation §7 nor
// TestInventory's climb-logging.feature scenario list mention a status
// precondition, only 300m proximity, so none is enforced here. Same
// reasoning as GradeVoteService: no self-exclusion either, since a
// submitter logging their own route is not documented as disallowed
// anywhere.
@Injectable()
export class ClimbLogsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gradeVoteService: GradeVoteService,
  ) {}

  async logClimb(
    routeId: string,
    userId: string,
    dto: LogClimbDto,
    location: ProximityLocation,
  ): Promise<ClimbLog> {
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
          `Climber must be within ${STANDARD_PROXIMITY_METERS}m of the route to log a climb`,
        );
      }

      // Foundation §7: snapshot whatever's currently displayed (live
      // consensus, or the submitter's Proposed Grade if fewer than 4
      // votes exist yet) -- shares GradeVoteService's exact computation
      // rather than re-deriving it, so the two callers can never disagree
      // on what "the current grade" means.
      const consensus = await this.gradeVoteService.computeConsensus(
        manager,
        route,
      );

      const logRepo = manager.getRepository(ClimbLog);
      return logRepo.save(
        logRepo.create({
          routeId,
          userId,
          outcome: dto.outcome,
          gradeSnapshotOrdinal: consensus.gradeOrdinal,
        }),
      );
    });
  }
}
