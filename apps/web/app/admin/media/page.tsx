import { AdminShell } from '@/components/admin/AdminShell';
import { FlagQueue } from '@/components/admin/FlagQueue';
import { RequireSession } from '@/components/auth/RequireSession';

// BL-027 / §14. The Global Flag Queue. Mirrors app/admin/gyms/page.tsx:
// RequireSession(requireAdmin) keeps it from rendering for a non-admin,
// RolesGuard answers 403 to one regardless (AR-17), and the dense layout
// comes from AdminShell.
export default function AdminMediaPage() {
  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Photo flag queue"
        description="Every photo awaiting review — fresh uploads and published photos a community report sent back. Rejecting a verification photo always strikes its uploader and voids the verification."
      >
        <FlagQueue />
      </AdminShell>
    </RequireSession>
  );
}
