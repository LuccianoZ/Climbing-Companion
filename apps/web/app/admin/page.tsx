import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { RequireSession } from '@/components/auth/RequireSession';

// AR-28: /admin is the seed of Epic 7's dashboard, so it is an index over
// sections rather than a redirect straight into the only built one. Sprint 3
// adds rows here; the shape does not have to change when it does.
export default function AdminHomePage() {
  return (
    <RequireSession requireAdmin>
      <AdminShell
        title="Admin dashboard"
        description="Moderation, direct verification, account accountability and data stewardship."
      >
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          <Link
            href="/admin/gyms"
            data-testid="admin-card-gyms"
            className="card-raised block p-4"
          >
            <p className="label-caps text-[9px] text-ink-faint">BL-012</p>
            <p className="mt-1 text-[15px] font-bold text-ink">
              Gym verification
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
              Verify a gym directly, bypassing the four-verifier gate, and set
              the disciplines it offers.
            </p>
          </Link>

          <Link
            href="/admin/media"
            data-testid="admin-card-media"
            className="card-raised block p-4"
          >
            <p className="label-caps text-[9px] text-ink-faint">
              BL-027 / BL-028 / BL-029 / BL-030
            </p>
            <p className="mt-1 text-[15px] font-bold text-ink">
              Photo flag queue
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
              Approve, reject, strike or ban on every pending photo. Rejecting a
              verification photo voids the verification and reverses its crag.
            </p>
          </Link>

          <Link
            href="/admin/users"
            data-testid="admin-card-users"
            className="card-raised block p-4"
          >
            <p className="label-caps text-[9px] text-ink-faint">BL-033</p>
            <p className="mt-1 text-[15px] font-bold text-ink">Strikes &amp; bans</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
              Look up an account&apos;s strike history and issue / revoke a
              strike, ban outright, or restore. Every action is reasoned and
              emailed.
            </p>
          </Link>

          <Link
            href="/admin/disputes"
            data-testid="admin-card-disputes"
            className="card-raised block p-4"
          >
            <p className="label-caps text-[9px] text-ink-faint">BL-x08</p>
            <p className="mt-1 text-[15px] font-bold text-ink">Gym disputes</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
              &ldquo;This gym&apos;s information is wrong&rdquo; reports from
              verifiers on site. Fix the gym or dismiss the report.
            </p>
          </Link>

          <Link
            href="/admin/stewardship"
            data-testid="admin-card-stewardship"
            className="card-raised block p-4"
          >
            <p className="label-caps text-[9px] text-ink-faint">BL-x07</p>
            <p className="mt-1 text-[15px] font-bold text-ink">
              Modify gyms &amp; climbs
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
              Search any gym or climb, change any field or its photos with a
              typed confirmation, or delete it outright.
            </p>
          </Link>
        </div>
      </AdminShell>
    </RequireSession>
  );
}
