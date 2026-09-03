import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, PublicUser } from './auth.service';

const SESSION_COOKIE_NAME = 'session';

// BL-028 / Foundation §12: a banned account is "locked out" -- reasoning
// arrives by email, there is no in-app notification. Every guarded route
// answers with this shape so the web client can tell a suspension apart
// from an ordinary signed-out 401 and render the "Account Suspended" screen
// (4-screen mockup) instead of bouncing to /login.
export const ACCOUNT_SUSPENDED_CODE = 'ACCOUNT_SUSPENDED';
export const accountSuspendedResponse = () => ({
  statusCode: 403,
  error: ACCOUNT_SUSPENDED_CODE,
  message: 'This account is suspended.',
});

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
    // route guarded by SessionGuard. The ban check still applies to that
    // path (BL-028), so it runs before this early return.
    if (request.user) {
      this.assertNotBanned(request.user);
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

    this.assertNotBanned(user);

    request.user = user;
    return true;
  }

  private assertNotBanned(user: PublicUser): void {
    if (user.isBanned) {
      throw new ForbiddenException(accountSuspendedResponse());
    }
  }
}
