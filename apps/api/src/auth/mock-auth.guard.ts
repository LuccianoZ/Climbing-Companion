import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, PublicUser } from './auth.service';

const MOCK_AUTH_HEADER = 'x-test-mock-auth';

type RequestWithOptionalUser = Request & { user?: PublicUser };

// BL-005 / Architecture.md AR-13: the X-Test-Mock-Auth bypass (Foundation
// §16). This class only ever gets constructed at all -- let alone
// registered as a guard anywhere -- when TestBypassModule.register()
// already confirmed both fail-closed conditions (NODE_ENV !== 'production'
// AND ENABLE_TEST_BYPASS_HEADERS === 'true') at bootstrap. It is registered
// as a *global* guard, so it runs on every request before any route-level
// guard; its only job when the header is absent is to get out of the way
// and let SessionGuard make the real decision -- it must never itself
// reject a request just for not carrying the header.
@Injectable()
export class MockAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithOptionalUser>();
    const mockUserId = (
      request.headers as Record<string, string> | undefined
    )?.[MOCK_AUTH_HEADER];

    if (!mockUserId) {
      return true;
    }

    const user = await this.authService.findPublicUserById(mockUserId);
    if (!user) {
      throw new UnauthorizedException(
        `X-Test-Mock-Auth: no user found for id "${mockUserId}"`,
      );
    }

    request.user = user;
    return true;
  }
}
