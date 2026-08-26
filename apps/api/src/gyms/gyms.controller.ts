import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SubmitGymDto } from './dto/submit-gym.dto';
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
}
