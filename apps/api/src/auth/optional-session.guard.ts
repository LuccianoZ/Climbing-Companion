import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, PublicUser } from './auth.service';

const SESSION_COOKIE_NAME = 'session';

export type MaybeAuthenticatedRequest = Request & { user?: PublicUser };

// BL-027: `GET /api/media/:id` is public for APPROVED assets but must
// recognise the owner and admins so they can still see a PENDING/REJECTED
// one (Foundation §10). SessionGuard can't do this -- it hard-rejects an
// anonymous caller -- and MediaController's GET deliberately carried no
// guard at all before this epic (AR-15).
//
// This guard NEVER rejects: it resolves the caller if a valid session (or,
// in test, an X-Test-Mock-Auth user already on the request) is present and
// attaches it, otherwise it leaves `request.user` undefined and the handler
// treats the caller as an anonymous visitor. A banned caller is treated as
// anonymous -- consistent with the §12 lockout, and it means a suspended
// user can't pull their own hidden assets back either.
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<MaybeAuthenticatedRequest>();

    // MockAuthGuard (test-only global) may already have resolved a user.
    if (request.user) {
      if (request.user.isBanned) {
        delete request.user;
      }
      return true;
    }

    const token = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE_NAME
    ];
    if (!token) {
      return true;
    }

    const user = await this.authService.validateSession(token);
    if (user && !user.isBanned) {
      request.user = user;
    }
    return true;
  }
}
