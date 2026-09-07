import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { AnalyticsService } from './analytics.service';

// BL-036/037. Foundation §12: climbing metrics are always public (no
// friend-gating here, unlike gym-activity's badges/streaks) -- any
// authenticated user can read anyone's outdoor analytics. Guarded only
// because Profile itself sits inside the authenticated-only 6-tab UI.
@Controller('users/:userId/outdoor-analytics')
@UseGuards(SessionGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  get(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.analyticsService.getOutdoorAnalytics(userId);
  }
}
