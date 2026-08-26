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
import { SubmitRouteVerificationDto } from './dto/submit-route-verification.dto';
import { VerificationService } from './verification.service';

type VerificationRequest = AuthenticatedRequest & { mockGps?: MockGpsLocation };

// BL-009 / Architecture.md AR-16: nested under /api/routes/:routeId so the
// URL names the route being verified -- mirroring how BL-006 already treats
// crag creation as inseparable from route submission rather than its own
// endpoint. Reuses SessionGuard the same way RoutesController/
// GymsController/MediaController do.
//
// AR-16: MockGpsGuard (a global guard, registered only under the same
// fail-closed bypass gate as MockAuthGuard) may have already attached a
// resolved location onto the request from X-Test-Mock-GPS. When it hasn't
// (the real, non-test path), the DTO's own latitude/longitude -- populated
// client-side from the browser's Geolocation API -- is used instead. Either
// way VerificationService only ever sees one resolved location; it has no
// idea which source supplied it.
@Controller('routes/:routeId/verifications')
export class RouteVerificationsController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  submit(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() dto: SubmitRouteVerificationDto,
    @Req() req: VerificationRequest,
  ) {
    const location =
      req.mockGps ??
      (dto.latitude != null && dto.longitude != null
        ? { latitude: dto.latitude, longitude: dto.longitude }
        : null);

    if (!location) {
      throw new BadRequestException(
        'A verifier location is required: supply latitude/longitude, or X-Test-Mock-GPS in test.',
      );
    }

    return this.verificationService.submitRouteVerification(
      routeId,
      req.user.id,
      dto,
      location,
    );
  }
}
