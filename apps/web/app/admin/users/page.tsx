import { AdminShell } from '@/components/admin/AdminShell';
import { UserAudit } from '@/components/admin/UserAudit';
import { RequireSession } from '@/components/auth/RequireSession';

// BL-033 / §14: the User Account Audit view. Same guard/shell pattern as the
// other admin pages -- RequireSession(requireAdmin) hides it from a non-admin,
// RolesGuard answers 403 regardless.
export default function AdminUsersPage() {
  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Strikes & bans"
        description="Look up an account by id to see its strike history and apply Issue Strike / Revoke Strike / Ban Outright / Restore Account. Every action needs a reason and emails the user."
      >
        <UserAudit />
      </AdminShell>
    </RequireSession>
  );
}
