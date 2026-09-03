import { AdminShell } from '@/components/admin/AdminShell';
import { EntityEditor } from '@/components/admin/EntityEditor';
import { RequireSession } from '@/components/auth/RequireSession';

// AR-51 BL-x07 / §14. `params` is a Promise in Next 16's App Router.
export default async function AdminStewardshipGymPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Edit gym"
        description="Change any field or its photos, then review a before/after and type SAVE to apply. Remove offers Archive (reversible) or permanent Delete (type DELETE)."
      >
        <EntityEditor kind="gym" id={id} />
      </AdminShell>
    </RequireSession>
  );
}
