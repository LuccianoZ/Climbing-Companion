import { AdminShell } from '@/components/admin/AdminShell';
import { EntityEditor } from '@/components/admin/EntityEditor';
import { RequireSession } from '@/components/auth/RequireSession';

// AR-51 BL-x07 / §14.
export default async function AdminStewardshipRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Edit climb"
        description="Change any field or its photos, then review a before/after and type SAVE to apply. Deleting a founding route also removes its crag and sibling routes."
      >
        <EntityEditor kind="route" id={id} />
      </AdminShell>
    </RequireSession>
  );
}
