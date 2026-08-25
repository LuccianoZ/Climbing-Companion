import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { MockAuthGuard } from './mock-auth.guard';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';

// BL-005 / Architecture.md AR-13: MockAuthGuard is the X-Test-Mock-Auth
// bypass. Unlike SessionGuard, it must never *block* a request on its own
// when the header is simply absent -- it's a global guard, so it runs on
// every request in every environment where it's registered at all, and its
// job when there's nothing to bypass is to get out of the way and let
// SessionGuard make the real decision.
describe('MockAuthGuard', () => {
  let guard: MockAuthGuard;
  let authService: { findPublicUserById: ReturnType<typeof vi.fn> };

  const contextFor = (request: {
    headers: Record<string, string>;
    user?: unknown;
  }): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    authService = { findPublicUserById: vi.fn() };
    guard = new MockAuthGuard(authService as unknown as AuthService);
  });

  it('passes through untouched when the header is absent, without calling the service', async () => {
    const request = { headers: {} };

    const result = await guard.canActivate(contextFor(request));

    expect(result).toBe(true);
    expect(request).not.toHaveProperty('user');
    expect(authService.findPublicUserById).not.toHaveBeenCalled();
  });

  it('attaches the referenced user and passes when the header names a real user', async () => {
    const user = {
      id: 'user-1',
      email: 'alex@example.com',
      displayName: 'Alex',
      role: UserRole.VERIFIED_USER,
    };
    authService.findPublicUserById.mockResolvedValue(user);
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { 'x-test-mock-auth': 'user-1' },
    };

    const result = await guard.canActivate(contextFor(request));

    expect(result).toBe(true);
    expect(request.user).toEqual(user);
    expect(authService.findPublicUserById).toHaveBeenCalledWith('user-1');
  });

  it('rejects when the header names a user id that does not exist', async () => {
    authService.findPublicUserById.mockResolvedValue(null);
    const request = { headers: { 'x-test-mock-auth': 'nonexistent-user' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
