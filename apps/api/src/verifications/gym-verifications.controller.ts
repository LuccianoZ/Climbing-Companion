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
import { SubmitGymVerificationDto } from './dto/submit-gym-verification.dto';
import { VerificationService } from './verification.service';

type VerificationRequest = AuthenticatedRequest & { mockGps?: MockGpsLocation };

// BL-011 / Architecture.md AR-17: nested under /api/gyms/:gymId so the URL
// names the gym being verified, mirroring RouteVerificationsController.
// Post-Sept-3 (BL-x06) this one endpoint handles both a "Yes" confirmation
// and a "No" dispute -- the DTO's `informationAccurate` flag selects.
@Controller('gyms/:gymId/verifications')
export class GymVerificationsController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  submit(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: SubmitGymVerificationDto,
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

    return this.verificationService.submitGymVerification(
      gymId,
      req.user.id,
      dto,
      location,
    );
  }
}
