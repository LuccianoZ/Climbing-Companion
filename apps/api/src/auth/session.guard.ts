import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, PublicUser } from './auth.service';

const SESSION_COOKIE_NAME = 'session';

export type AuthenticatedRequest = Request & { user: PublicUser };

// BL-003 / Architecture.md AR-11: BL-002 only ever issued the session
// cookie -- nothing checked it afterwards. This guard is the missing other
// half: it reads the raw `session` cookie, delegates to
// AuthService.validateSession() (which re-hashes the token and checks it
// against `users.refresh_token_hash` / `refresh_token_expires_at`, per
// AR-10's storage), and attaches the resolved user onto the request for
// downstream handlers. Any route that needs "must be logged in" reaches for
// this guard rather than re-implementing cookie/hash lookup itself.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // BL-005 / Architecture.md AR-13: MockAuthGuard (a global guard, only
    // ever registered at all under NODE_ENV !== 'production' with
    // ENABLE_TEST_BYPASS_HEADERS === 'true') runs before route-level guards
    // and may have already resolved a mock user from X-Test-Mock-Auth onto
    // the request. Defer to it instead of demanding a real cookie -- this
    // is what lets the bypass header substitute for a real login on any
    // route guarded by SessionGuard.
    if (request.user) {
      return true;
    }

    const token = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE_NAME
    ];

    if (!token) {
      throw new UnauthorizedException('No active session');
    }

    const user = await this.authService.validateSession(token);
    if (!user) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    request.user = user;
    return true;
  }
}
