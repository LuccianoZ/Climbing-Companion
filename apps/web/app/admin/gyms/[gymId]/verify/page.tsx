import { AdminShell } from '@/components/admin/AdminShell';
import { AdminVerifyGymForm } from '@/components/admin/AdminVerifyGymForm';
import { RequireSession } from '@/components/auth/RequireSession';

// `params` is a Promise in Next 16's App Router, so this page is a Server
// Component that awaits it and hands the plain id to the client form. Typed
// explicitly rather than through Next's generated PageProps for the same
// reason app/layout.tsx is: those types live in .next/types, and depending on
// them means `tsc --noEmit` cannot run on a clean checkout.
export default async function AdminVerifyGymPage({
  params,
}: {
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;

  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Verify gym directly"
        description="This bypasses the four-verifier gate. No photo, no proximity check — the disciplines you enter become the gym's listed disciplines."
      >
        <AdminVerifyGymForm gymId={gymId} />
      </AdminShell>
    </RequireSession>
  );
}
