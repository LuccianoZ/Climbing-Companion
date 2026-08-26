import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';

export const ROLES_KEY = 'roles';

// Architecture.md AR-17 / BL-012: pairs with RolesGuard (roles.guard.ts) to
// gate an endpoint on the caller's `users.role`. Deliberately generic --
// not gym-verification-specific -- so Epic 7's Admin Dashboard (Sprint 3,
// same `/admin/*` need flagged in the BL-011/012/013 handoff) reuses this
// same decorator/guard pair rather than re-deriving RBAC a second time.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
