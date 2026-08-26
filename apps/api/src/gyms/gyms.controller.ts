import {
  Body,
  Controller,
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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SubmitGymDto } from './dto/submit-gym.dto';
import { AdminVerifyGymDto } from './dto/admin-verify-gym.dto';
import { GymsService } from './gyms.service';

// BL-007 / Architecture.md AR-11: reuses SessionGuard, same as
// RoutesController.
@Controller('gyms')
export class GymsController {
  constructor(private readonly gymsService: GymsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  submit(@Body() dto: SubmitGymDto, @Req() req: AuthenticatedRequest) {
    return this.gymsService.submitGym(req.user.id, dto);
  }

  // BL-012 / Architecture.md AR-17: the first endpoint in the codebase
  // gated on a role rather than just "logged in" -- SessionGuard resolves
  // who's calling, RolesGuard (must run after it) rejects anyone who
  // isn't SYSTEM_ADMIN with a 403. PATCH, not POST, since this mutates an
  // existing gym rather than creating anything.
  @Patch(':gymId/admin-verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  adminVerify(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: AdminVerifyGymDto,
  ) {
    return this.gymsService.adminVerifyGym(gymId, dto);
  }
}
