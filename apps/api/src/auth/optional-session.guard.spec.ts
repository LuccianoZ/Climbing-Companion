import { ExecutionContext } from '@nestjs/common';
import { OptionalSessionGuard } from './optional-session.guard';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';

// BL-027: never rejects. Resolves the caller if a valid, non-banned session
// (or a mock-auth user already on the request) is present; otherwise leaves
// the request anonymous.
describe('OptionalSessionGuard', () => {
  let guard: OptionalSessionGuard;
  let authService: { validateSession: ReturnType<typeof vi.fn> };

  const contextFor = (request: {
    cookies?: Record<string, string>;
    user?: unknown;
  }): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    authService = { validateSession: vi.fn() };
    guard = new OptionalSessionGuard(authService as unknown as AuthService);
  });

  it('allows an anonymous request through with no user attached', async () => {
    const request: { cookies: Record<string, string>; user?: unknown } = {
      cookies: {},
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
    expect(authService.validateSession).not.toHaveBeenCalled();
  });

  it('attaches a resolved, non-banned user from the session cookie', async () => {
    const user = {
      id: 'user-1',
      email: 'a@b.c',
      displayName: 'A',
      role: UserRole.VERIFIED_USER,
      isBanned: false,
    };
    authService.validateSession.mockResolvedValue(user);
    const request: { cookies: Record<string, string>; user?: unknown } = {
      cookies: { session: 'valid' },
    };

    await guard.canActivate(contextFor(request));

    expect(request.user).toEqual(user);
  });

  it('treats a banned session as anonymous (does not attach the user)', async () => {
    authService.validateSession.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.c',
      displayName: 'A',
      role: UserRole.VERIFIED_USER,
      isBanned: true,
    });
    const request: { cookies: Record<string, string>; user?: unknown } = {
      cookies: { session: 'valid' },
    };

    await guard.canActivate(contextFor(request));

    expect(request.user).toBeUndefined();
  });

  it('strips a banned user that a global mock-auth guard already attached', async () => {
    const request: { cookies: Record<string, string>; user?: unknown } = {
      cookies: {},
      user: {
        id: 'user-1',
        email: 'a@b.c',
        displayName: 'A',
        role: UserRole.VERIFIED_USER,
        isBanned: true,
      },
    };

    await guard.canActivate(contextFor(request));

    expect(request.user).toBeUndefined();
  });
});
