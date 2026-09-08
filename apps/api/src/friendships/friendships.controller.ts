import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { FriendshipsService } from './friendships.service';

// AR-55 (Sept 7, 2026 -- Part 2): friendships are created only through the
// invite-link flow (see FriendInviteLinksController). What is left here is
// reading your friends and removing one. Every endpoint requires a session.
@Controller('friendships')
@UseGuards(SessionGuard)
export class FriendshipsController {
  constructor(private readonly friendshipsService: FriendshipsService) {}

  // The "Your friends" list in Profile (BL-041). With no user directory,
  // this list plus the unadd action is the whole friend-management surface.
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.friendshipsService.listFriendsForUser(req.user.id);
  }

  // Unadd: unilateral removal of an ACTIVE friendship by either party.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.friendshipsService.remove(id, req.user.id);
  }
}
