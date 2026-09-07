import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { FriendshipsService } from './friendships.service';

// BL-x11 (Epic 8, pulled forward from BL-039/040). Every endpoint requires
// a session -- there is no unauthenticated friendship action.
@Controller('friendships')
@UseGuards(SessionGuard)
export class FriendshipsController {
  constructor(private readonly friendshipsService: FriendshipsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  send(@Body() dto: SendFriendRequestDto, @Req() req: AuthenticatedRequest) {
    return this.friendshipsService.sendRequest(req.user.id, dto.addresseeId);
  }

  @Get('pending')
  listPending(@Req() req: AuthenticatedRequest) {
    return this.friendshipsService.listPendingForUser(req.user.id);
  }

  @Patch(':id/accept')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.friendshipsService.accept(id, req.user.id);
  }

  // Covers both Decline (a PENDING request) and Unadd (an ACTIVE
  // friendship) -- FriendshipsService.remove() distinguishes them by status.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.friendshipsService.remove(id, req.user.id);
  }
}
