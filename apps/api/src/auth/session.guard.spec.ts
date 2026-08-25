import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';

// BL-003 / Architecture.md AR-11: the guard itself is tested in isolation
// from AuthService.validateSession (covered separately in
// auth.service.spec.ts) -- this suite only proves the guard's own
// responsibilities: reading the cookie, delegating the lookup, rejecting
// when there's no session, and attaching the resolved user when there is.
describe('SessionGuard', () => {
  let guard: SessionGuard;
  let authService: { validateSession: ReturnType<typeof vi.fn> };

  const contextFor = (request: {
    cookies: Record<string, string>;
    user?: unknown;
  }): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    authService = { validateSession: vi.fn() };
    guard = new SessionGuard(authService as unknown as AuthService);
  });

  it('rejects a request with no session cookie at all, without calling the service', async () => {
    await expect(
      guard.canActivate(contextFor({ cookies: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authService.validateSession).not.toHaveBeenCalled();
  });

  it('rejects a request whose cookie does not resolve to an active session', async () => {
    authService.validateSession.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextFor({ cookies: { session: 'stale-or-expired-token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows the request through and attaches the resolved user when the session is valid', async () => {
    const user = {
      id: 'user-1',
      email: 'alex@example.com',
      displayName: 'Alex',
      role: UserRole.VERIFIED_USER,
    };
    authService.validateSession.mockResolvedValue(user);
    const request = {
      cookies: { session: 'valid-token' },
      user: undefined as unknown,
    };

    const result = await guard.canActivate(contextFor(request));

    expect(result).toBe(true);
    expect(request.user).toEqual(user);
    expect(authService.validateSession).toHaveBeenCalledWith('valid-token');
  });

  // BL-005 / Architecture.md AR-13: when MockAuthGuard (a global guard) ran
  // earlier in the chain and already resolved a mock user onto the request,
  // SessionGuard must defer to it instead of demanding a real cookie --
  // this is what lets X-Test-Mock-Auth substitute for a real login on any
  // route guarded by SessionGuard.
  it('honors a user already attached to the request by an earlier global guard, without checking the cookie', async () => {
    const user = {
      id: 'user-1',
      email: 'alex@example.com',
      displayName: 'Alex',
      role: UserRole.VERIFIED_USER,
    };
    const request = { cookies: {}, user };

    const result = await guard.canActivate(contextFor(request));

    expect(result).toBe(true);
    expect(authService.validateSession).not.toHaveBeenCalled();
  });
});
