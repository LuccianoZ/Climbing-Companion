import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { FriendInviteLinksService } from './friend-invite-links.service';

// AR-55 (Sept 7, 2026 -- Part 2), BL-040 / BL-041. Both endpoints require a
// session: minting a link is a "me" action, and redeeming one has to know
// who the redeemer is. The redeem landing page in apps/web is
// SessionGuard-equivalent -- it bounces an unauthenticated visitor through
// login with ?next= back to the link, then calls this.
@Controller('friend-invite-links')
@UseGuards(SessionGuard)
export class FriendInviteLinksController {
  constructor(
    private readonly friendInviteLinksService: FriendInviteLinksService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest) {
    return this.friendInviteLinksService.create(req.user.id);
  }

  // The token is an opaque secret, not a UUID -- no ParseUUIDPipe. An
  // unknown token is a 404 from the service, not a validation error.
  @Post(':token/redeem')
  @HttpCode(HttpStatus.OK)
  redeem(@Param('token') token: string, @Req() req: AuthenticatedRequest) {
    return this.friendInviteLinksService.redeem(token, req.user.id);
  }
}
