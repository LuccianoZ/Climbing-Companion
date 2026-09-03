'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchMapPins } from '@/lib/api';
import type { MapPin } from '@/lib/types';

// AR-31. The queue is GET /api/map/pins filtered client-side to unverified
// gyms, rather than a new guarded admin read on MapModule.
//
// That is a deliberate trade, and the reason is AR-19's own warning: the whole
// map surface is unguarded on purpose, and "a write handler added there later
// would inherit the missing guard silently". Adding an admin-only read to that
// controller is the first step down exactly that path -- the next person adds
// a second handler beside it and forgets the guard. The endpoint already
// returns every visible gym with its lifecycle status, so no new server code
// is needed to answer this question at all.
//
// The known ceiling: it fetches every pin to display a subset. At Foundation
// section 20.2's scale (~20-25 concurrent users, a demo-sized dataset) that is
// nothing, and it is the obvious thing for Epic 7 to replace with a paged,
// guarded admin query when the moderation queue needs one anyway.

export function UnverifiedGymList() {
  const [pins, setPins] = useState<MapPin[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchMapPins(controller.signal)
      .then(setPins)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  if (failed) {
    return (
      <p
        data-testid="admin-gyms-error"
        className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2.5 text-[12px] text-clay-deep"
      >
        Couldn&apos;t load the gym list. Check that the API is running.
      </p>
    );
  }

  if (pins === null) {
    return (
      <p
        data-testid="admin-gyms-loading"
        className="text-[12px] text-ink-faint"
      >
        Loading gyms…
      </p>
    );
  }

  // ARCHIVED gyms never reach here -- MapService already drops them from the
  // pin query (AR-19) -- so this is only ever splitting UNVERIFIED from
  // VERIFIED.
  const gyms = pins.filter((pin) => pin.kind === 'GYM');
  const unverified = gyms.filter((pin) => pin.status === 'UNVERIFIED');

  if (unverified.length === 0) {
    return (
      <p
        data-testid="admin-gyms-empty"
        className="rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-3 text-[12px] text-ink-soft"
      >
        Every gym on the map is verified. Nothing waiting.
      </p>
    );
  }

  return (
    <div data-testid="admin-gym-queue" className="card overflow-hidden">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-[1.5px] border-line bg-paper">
            <Th>Gym</Th>
            <Th>Status</Th>
            <Th>Coordinates</Th>
            <Th>{''}</Th>
          </tr>
        </thead>
        <tbody>
          {unverified.map((gym) => (
            <tr
              key={gym.id}
              data-testid="admin-gym-row"
              data-gym-id={gym.id}
              className="border-b border-line-soft last:border-b-0"
            >
              <td className="px-3 py-2.5 text-[12.5px] font-semibold text-ink">
                {gym.name}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded-full border border-line-soft bg-paper px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">
                  Unverified
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-[11px] text-ink-faint">
                {gym.latitude.toFixed(4)}, {gym.longitude.toFixed(4)}
              </td>
              <td className="px-3 py-2.5 text-right">
                <div className="flex justify-end gap-1.5">
                  <Link
                    href={`/admin/stewardship/gym/${gym.id}`}
                    data-testid="admin-edit-link"
                    className="inline-block rounded-[8px] border-[1.5px] border-line-soft px-3 py-1.5 text-[11.5px] font-semibold text-ink-soft"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/admin/gyms/${gym.id}/verify`}
                    data-testid="admin-verify-link"
                    className="inline-block rounded-[8px] border-[1.5px] border-ink bg-ink px-3 py-1.5 text-[11.5px] font-semibold text-paper"
                  >
                    Verify directly
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="label-caps px-3 py-2 text-[9px] text-ink-faint">
      {children}
    </th>
  );
}
