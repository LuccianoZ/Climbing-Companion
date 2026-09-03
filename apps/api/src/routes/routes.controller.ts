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
import { SubmitRouteDto } from './dto/submit-route.dto';
import { AdminUpdateRouteDto } from './dto/admin-update-route.dto';
import { RoutesService } from './routes.service';

type RouteRequest = AuthenticatedRequest & { mockGps?: MockGpsLocation };

// BL-006 / Architecture.md AR-11: reuses SessionGuard (exported from
// AuthModule).
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  // BL-006 + Sept 3 revision (AR-51, BL-x02/x03): non-admin submissions are
  // 300m-proximity-gated against the submitter's device location; an admin's
  // is not, and creates the climb (and any new crag) VERIFIED. Device
  // location resolves X-Test-Mock-GPS -> DTO device fields -> pin coords.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  submit(@Body() dto: SubmitRouteDto, @Req() req: RouteRequest) {
    const isAdmin = req.user.role === UserRole.SYSTEM_ADMIN;
    const deviceLocation =
      req.mockGps ??
      (dto.deviceLatitude != null && dto.deviceLongitude != null
        ? { latitude: dto.deviceLatitude, longitude: dto.deviceLongitude }
        : { latitude: dto.latitude, longitude: dto.longitude });

    return this.routesService.submitRoute(req.user.id, dto, {
      deviceLocation,
      isAdmin,
    });
  }

  // BL-x07 / Foundation §14: the admin editor's read (includes archived).
  @Get(':routeId')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  getForAdmin(@Param('routeId', ParseUUIDPipe) routeId: string) {
    return this.routesService.getRouteForAdmin(routeId);
  }

  // BL-x07 / Foundation §14: admin edits any field of any climb, including
  // its photo set.
  @Patch(':routeId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  adminUpdate(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() dto: AdminUpdateRouteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.routesService.adminUpdateRoute(routeId, dto, req.user.id);
  }

  // BL-035 / Foundation §14: force-archive ("take down"), cascading a
  // founding route to its crag. Reversible, so no typed confirmation.
  @Post(':routeId/force-archive')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  forceArchive(@Param('routeId', ParseUUIDPipe) routeId: string) {
    return this.routesService.forceArchiveRoute(routeId);
  }

  // BL-x07: un-archive.
  @Post(':routeId/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  restore(@Param('routeId', ParseUUIDPipe) routeId: string) {
    return this.routesService.restoreRoute(routeId);
  }

  // BL-x07: irreversible delete. A founding route takes its whole crag (and
  // every sibling route) with it. UI-gated behind typing "DELETE".
  @Delete(':routeId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMIN)
  hardDelete(@Param('routeId', ParseUUIDPipe) routeId: string) {
    return this.routesService.hardDeleteRoute(routeId);
  }
}
