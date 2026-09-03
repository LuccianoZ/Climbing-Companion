import { AdminShell } from '@/components/admin/AdminShell';
import { GymDisputeQueue } from '@/components/admin/GymDisputeQueue';
import { RequireSession } from '@/components/auth/RequireSession';

// BL-x08 / §14: the gym-information dispute queue.
export default function AdminDisputesPage() {
  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Gym disputes"
        description="Open “this gym's information is wrong” reports from verifiers on site. Fix the gym or dismiss the report — either way, Resolve clears it from the queue."
      >
        <GymDisputeQueue />
      </AdminShell>
    </RequireSession>
  );
}
