import { AdminShell } from '@/components/admin/AdminShell';
import { StewardshipSearch } from '@/components/admin/StewardshipSearch';
import { RequireSession } from '@/components/auth/RequireSession';

// AR-51 BL-x07 / §14: modify or remove any gym or climb.
export default function AdminStewardshipPage() {
  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Modify gyms & climbs"
        description="Search a gym or climb by name, then change any of its information — including its photos — or take it off the map. Changes need a typed confirmation; permanent deletion needs you to type DELETE."
      >
        <StewardshipSearch />
      </AdminShell>
    </RequireSession>
  );
}
