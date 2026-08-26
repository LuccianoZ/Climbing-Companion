import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './session.guard';
import { UserRole } from '../users/entities/user.entity';
import { ROLES_KEY } from './roles.decorator';

// Architecture.md AR-17 / BL-012: the missing "does this logged-in someone
// have a particular role" guard flagged in the BL-011/012/013 handoff --
// every guard before this one (SessionGuard, MockAuthGuard, MockGpsGuard)
// only ever answered "is someone logged in" / "what's their location".
// Always pair with SessionGuard, in that order --
// @UseGuards(SessionGuard, RolesGuard) -- so `request.user` (and its
// `role`, already carried by PublicUser) is populated before this guard
// ever runs; RolesGuard itself does not authenticate anyone.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // No @Roles() on the route at all -- nothing to enforce, get out of the
    // way (mirrors MockAuthGuard/MockGpsGuard's "absent means pass through"
    // convention for guards that gate on an optional signal).
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }
    return true;
  }
}
