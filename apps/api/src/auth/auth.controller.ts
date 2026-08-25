import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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
}
