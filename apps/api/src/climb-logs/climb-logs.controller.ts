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
import { LogClimbDto } from './dto/log-climb.dto';
import { ClimbLogsService } from './climb-logs.service';

type LogRequest = AuthenticatedRequest & { mockGps?: MockGpsLocation };

// BL-017 / BL-018 / Architecture.md AR-18: nested under /api/routes/:routeId,
// same URL-naming and location-resolution conventions (AR-16) as every
// other 300m-gated controller in this codebase.
@Controller('routes/:routeId/climb-logs')
export class ClimbLogsController {
  constructor(private readonly climbLogsService: ClimbLogsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  log(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() dto: LogClimbDto,
    @Req() req: LogRequest,
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

    return this.climbLogsService.logClimb(routeId, req.user.id, dto, location);
  }
}
