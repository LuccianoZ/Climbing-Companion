import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

// Epic 6 read surface for the Alerts tab (6-screen mockup). Guarded --
// notifications are per-recipient and there is no public view of them.
// Epic 7 replaces this with the unified poll endpoint (§19.2); until then
// the Alerts screen polls this directly at the same 10s cadence, pausing
// when the tab is hidden (client-side, Page Visibility API).
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(SessionGuard)
  async list(
    @Query() query: ListNotificationsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const since = query.since ? new Date(query.since) : undefined;
    const rows = await this.notificationsService.listForUser(
      req.user.id,
      since,
    );
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      relatedEntityId: n.relatedEntityId,
      createdAt: n.createdAt.toISOString(),
    }));
  }
}
