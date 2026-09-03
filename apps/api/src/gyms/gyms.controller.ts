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
import type { MockGpsLocation } from '../auth/mock-gps.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SubmitGymDto } from './dto/submit-gym.dto';
import { AdminVerifyGymDto } from './dto/admin-verify-gym.dto';
import { AdminUpdateGymDto } from './dto/admin-update-gym.dto';
import { GymsService } from './gyms.service';

type GymRequest = AuthenticatedRequest & { mockGps?: MockGpsLocation };

// BL-007 / Architecture.md AR-11: reuses SessionGuard, same as
// RoutesController.
@Controller('gyms')
export class GymsController {
  constructor(private readonly gymsService: GymsService) {}

  // BL-007 + Sept 3 revision (AR-51, BL-x02/x03): a non-admin submission is
  // 300m-proximity-gated; an admin's is not (and is created VERIFIED). The
  // submitter's device location is resolved here the same way the
  // verification controllers do (AR-16): X-Test-Mock-GPS wins, then the
  // DTO's deviceLatitude/deviceLongitude, then the pin coordinates.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  submit(@Body() dto: SubmitGymDto, @Req() req: GymRequest) {
    const isAdmin = req.user.role === UserRole.SYSTEM_ADMIN;
    const deviceLocation =
      req.mockGps ??
      (dto.deviceLatitude != null && dto.deviceLongitude != null
        ? { latitude: dto.deviceLatitude, longitude: dto.deviceLongitude }
        : { latitude: dto.latitude, longitude: dto.longitude });

    return this.gymsService.submitGym(req.user.id, dto, {
      deviceLocation,
      isAdmin,
    });
  }

  // BL-012 / Architecture.md AR-17: direct verification of an existing gym.
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

  // BL-x07 / Foundation §14: the admin editor's read (includes archived).
  @Get(':gymId')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  getForAdmin(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.gymsService.getGymForAdmin(gymId);
  }

  // BL-x07 / Foundation §14: admin edits any field of any gym, including its
  // photo set.
  @Patch(':gymId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  adminUpdate(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: AdminUpdateGymDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.gymsService.adminUpdateGym(gymId, dto, req.user.id);
  }

  // BL-035 / Foundation §14: force-archive ("take down") -- reversible, so
  // the UI does not gate it behind a typed confirmation.
  @Post(':gymId/force-archive')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  forceArchive(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.gymsService.forceArchiveGym(gymId);
  }

  // BL-x07: un-archive a force-archived gym.
  @Post(':gymId/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  restore(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.gymsService.restoreGym(gymId);
  }

  // BL-x07: the irreversible delete. The UI gates this behind typing
  // "DELETE"; the server just performs the cascade.
  @Delete(':gymId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  hardDelete(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.gymsService.hardDeleteGym(gymId);
  }
}
