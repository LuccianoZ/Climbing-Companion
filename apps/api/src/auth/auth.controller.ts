import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { SessionGuard } from './session.guard';
import type { AuthenticatedRequest } from './session.guard';

const SESSION_COOKIE_NAME = 'session';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, sessionToken, sessionExpiresAt } =
      await this.authService.login(dto);

    // Foundation §15 / §20.2: HttpOnly + Secure + SameSite=Strict, always --
    // not conditional on environment. Secure means this cookie is only ever
    // actually set by a real browser over HTTPS (the Cloudflare Tunnel, not
    // plain local http://), which is deliberate per §20.2, not a bug.
    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      expires: sessionExpiresAt,
    });

    return user;
  }

  // BL-003 / Architecture.md AR-11: logout requires an active session (the
  // same SessionGuard any other protected route would use) so it knows
  // *which* user's session to clear. Clears both halves per the story's
  // acceptance criteria: the server-side row (AuthService.logout, so a
  // replayed old cookie is rejected afterwards) and the browser's cookie
  // (res.clearCookie, matching login's cookie options so the browser
  // actually drops it).
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.user.id);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { success: true };
  }

  // BL-003 / Architecture.md AR-11: minimal protected endpoint whose sole
  // purpose is to prove SessionGuard actually gates a request -- there was
  // no protected endpoint anywhere in the app before this story.
  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthenticatedRequest) {
    return req.user;
  }

  // BL-004 / Architecture.md AR-12: always returns the same response
  // whether or not the email has an account -- the enumeration protection
  // lives in AuthService.requestPasswordReset itself (it silently no-ops
  // for an unknown email), so there's nothing branch-specific to leak here.
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.authService.requestPasswordReset(dto.email);
    return { success: true };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { success: true };
  }
}
