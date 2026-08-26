import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../users/entities/user.entity';

// Architecture.md AR-17: proves RolesGuard's own two responsibilities in
// isolation -- reading required roles off the route via Reflector, and
// comparing them against request.user.role (already attached by
// SessionGuard/MockAuthGuard by the time this guard ever runs).
describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let guard: RolesGuard;

  const contextFor = (user: { role: UserRole }): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows the request through when the route declares no @Roles() at all', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = guard.canActivate(
      contextFor({ role: UserRole.VERIFIED_USER }),
    );

    expect(result).toBe(true);
  });

  it('allows a SYSTEM_ADMIN through a route requiring SYSTEM_ADMIN', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SYSTEM_ADMIN]);

    const result = guard.canActivate(
      contextFor({ role: UserRole.SYSTEM_ADMIN }),
    );

    expect(result).toBe(true);
  });

  it('rejects a VERIFIED_USER on a route requiring SYSTEM_ADMIN with a 403, not a 401', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SYSTEM_ADMIN]);

    expect(() =>
      guard.canActivate(contextFor({ role: UserRole.VERIFIED_USER })),
    ).toThrow(ForbiddenException);
  });
});
