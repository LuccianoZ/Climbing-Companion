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
import { SubmitRouteDto } from './dto/submit-route.dto';
import { RoutesService } from './routes.service';

// BL-006 / Architecture.md AR-11: reuses SessionGuard (exported from
// AuthModule for exactly this reuse) rather than re-implementing
// cookie/hash lookup -- this is the first non-auth module to actually
// exercise that reuse.
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  submit(@Body() dto: SubmitRouteDto, @Req() req: AuthenticatedRequest) {
    return this.routesService.submitRoute(req.user.id, dto);
  }
}
