import {
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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ModerationService } from './moderation.service';
import { ModerateMediaDto } from './dto/moderate-media.dto';
import { ReportMediaDto } from './dto/report-media.dto';

// BL-027/028/030. One controller, explicit full paths per handler, because
// the surface spans two audiences: `/admin/*` is SYSTEM_ADMIN-only (same
// SessionGuard + RolesGuard pair AR-17 established for BL-012), while
// `POST /media/:id/reports` is any logged-in Verified Climber. Mixing
// guarded-admin and guarded-user handlers on one controller is fine here --
// every handler is guarded; what AR-19 warns against is mixing guarded with
// UNguarded, which would leak an endpoint by omission.
@Controller()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  // §14: the Global Flag Queue's list endpoint.
  @Get('admin/flag-queue')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  getFlagQueue() {
    return this.moderationService.getFlagQueue();
  }

  // BL-028: Approve / Reject / Reject+Strike / Reject+Ban.
  @Post('admin/media/:mediaId/moderate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  moderate(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: ModerateMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.moderationService.moderateMediaAsset(req.user.id, mediaId, dto);
  }

  // BL-030: a community report on a published asset.
  @Post('media/:mediaId/reports')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  report(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: ReportMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.moderationService.reportAsset(req.user.id, mediaId, dto);
  }
}
