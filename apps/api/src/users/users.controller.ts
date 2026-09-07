import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { UpdateBadgesPublicDto } from './dto/update-badges-public.dto';
import { UsersService } from './users.service';

// BL-x09 (Epic 8, AR-53, Sept 7, 2026).
@Controller('users')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me/badges-public')
  async updateBadgesPublic(
    @Body() dto: UpdateBadgesPublicDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = await this.usersService.setBadgesPublic(
      req.user.id,
      dto.badgesPublic,
    );
    return { badgesPublic: user.badgesPublic };
  }
}
