import { AdminShell } from '@/components/admin/AdminShell';
import { UnverifiedGymList } from '@/components/admin/UnverifiedGymList';
import { RequireSession } from '@/components/auth/RequireSession';

export default function AdminGymsPage() {
  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Gym verification"
        description="Gyms still waiting on four community verifications. Verifying one here sets its disciplines directly and skips that gate entirely."
      >
        <UnverifiedGymList />
      </AdminShell>
    </RequireSession>
  );
}
