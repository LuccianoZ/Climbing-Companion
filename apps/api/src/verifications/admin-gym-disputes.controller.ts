import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { VerificationService } from './verification.service';

// BL-x08 / Foundation §14: the Admin Dashboard's gym-information dispute
// queue. Same SessionGuard + RolesGuard(SYSTEM_ADMIN) pair as every other
// /admin/* surface. A resolve stamps resolved_at; whether the admin fixed
// the gym (PATCH /api/gyms/:id, BL-x07) or dismissed the dispute is out of
// band.
@Controller('admin/gym-disputes')
@UseGuards(SessionGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMIN)
export class AdminGymDisputesController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get()
  list() {
    return this.verificationService.listOpenGymDisputes();
  }

  @Post(':disputeId/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@Param('disputeId', ParseUUIDPipe) disputeId: string) {
    return this.verificationService.resolveGymDispute(disputeId);
  }
}
