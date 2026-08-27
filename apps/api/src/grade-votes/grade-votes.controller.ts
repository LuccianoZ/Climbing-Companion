import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import type { MockGpsLocation } from '../auth/mock-gps.guard';
import { VoteOnGradeDto } from './dto/vote-on-grade.dto';
import { GradeVoteService } from './grade-vote.service';

type VoteRequest = AuthenticatedRequest & { mockGps?: MockGpsLocation };

// BL-015 / BL-016 / Architecture.md AR-18: nested under /api/routes/:routeId,
// same URL-naming convention as RouteVerificationsController. The vote
// action requires SessionGuard (must be a logged-in climber); the
// consensus read does not -- TestInventory's "vote distribution is
// visible to an unauthenticated Visitor" is a hard requirement, not an
// oversight, so GET .../grade-votes/consensus is deliberately left
// unguarded. Same X-Test-Mock-GPS-or-DTO location resolution as every
// other 300m-gated controller (AR-16).
@Controller('routes/:routeId/grade-votes')
export class GradeVotesController {
  constructor(private readonly gradeVoteService: GradeVoteService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  vote(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() dto: VoteOnGradeDto,
    @Req() req: VoteRequest,
  ) {
    const location =
      req.mockGps ??
      (dto.latitude != null && dto.longitude != null
        ? { latitude: dto.latitude, longitude: dto.longitude }
        : null);

    if (!location) {
      throw new BadRequestException(
        'A voter location is required: supply latitude/longitude, or X-Test-Mock-GPS in test.',
      );
    }

    return this.gradeVoteService.voteOnGrade(
      routeId,
      req.user.id,
      dto,
      location,
    );
  }

  @Get('consensus')
  getConsensus(@Param('routeId', ParseUUIDPipe) routeId: string) {
    return this.gradeVoteService.getGradeConsensus(routeId);
  }
}
