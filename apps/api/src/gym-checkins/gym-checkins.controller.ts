import {
  BadRequestException,
  Body,
  Controller,
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
import { CheckInDto } from './dto/check-in.dto';
import { GymCheckinsService } from './gym-checkins.service';

type CheckInRequest = AuthenticatedRequest & { mockGps?: MockGpsLocation };

// BL-024 / Architecture.md AR-16-style 300m-gated controller. Nested under
// /api/gyms/:gymId, mirroring ClimbLogsController's and GradeVotesController's
// shape and location resolution exactly: X-Test-Mock-GPS or the DTO's own
// latitude/longitude, whichever the request actually carries.
@Controller('gyms/:gymId/check-ins')
export class GymCheckinsController {
  constructor(private readonly gymCheckinsService: GymCheckinsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  checkIn(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: CheckInDto,
    @Req() req: CheckInRequest,
  ) {
    const location =
      req.mockGps ??
      (dto.latitude != null && dto.longitude != null
        ? { latitude: dto.latitude, longitude: dto.longitude }
        : null);

    if (!location) {
      throw new BadRequestException(
        'A climber location is required: supply latitude/longitude, or X-Test-Mock-GPS in test.',
      );
    }

    return this.gymCheckinsService.checkIn(gymId, req.user.id, dto, location);
  }
}
