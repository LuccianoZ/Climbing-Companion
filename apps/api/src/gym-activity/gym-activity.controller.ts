import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { GymActivityService } from './gym-activity.service';

// BL-x09/x10 (Epic 8, AR-53). Nested under /api/users, mirroring the
// profile-read shape rather than living on GymsModule -- this reads a
// *user's* badge shelf and streaks, not a gym's data. Guarded like every
// other profile-adjacent endpoint: Foundation §12 places Profile inside the
// authenticated-only 6-tab UI, so there is no unauthenticated read path to
// widen here.
@Controller('users/:userId/gym-activity')
@UseGuards(SessionGuard)
export class GymActivityController {
  constructor(private readonly gymActivityService: GymActivityService) {}

  @Get()
  get(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.gymActivityService.getActivityForProfile(userId, req.user.id);
  }
}
