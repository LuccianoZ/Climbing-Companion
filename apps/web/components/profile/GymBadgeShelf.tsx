import type { GymBadge } from '@/lib/types';

// BL-x09 (AR-53, Sept 7 2026). A first check-in at a gym permanently earns
// a badge showing that gym's initials and the year earned -- the badge
// keeps rendering from its own name/initials snapshot even after the gym
// is later removed from the map (gymId goes null, the snapshot doesn't).
export function GymBadgeShelf({ badges }: { badges: GymBadge[] }) {
  if (badges.length === 0) {
    return (
      <p
        data-testid="gym-badge-shelf-empty"
        className="text-[12px] text-ink-faint"
      >
        No gym badges yet — check in at a gym to earn your first one.
      </p>
    );
  }

  return (
    <div data-testid="gym-badge-shelf" className="flex flex-wrap gap-3">
      {badges.map((badge) => (
        <div
          key={badge.id}
          data-testid="gym-badge"
          title={badge.gymNameSnapshot}
          className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-[1.5px] border-line bg-clay-wash text-clay-deep"
        >
          <span className="text-[15px] font-extrabold tracking-tight">
            {badge.gymInitialsSnapshot}
          </span>
          <span className="text-[9px] font-bold text-ink-soft">
            {new Date(badge.earnedAt).getFullYear()}
          </span>
        </div>
      ))}
    </div>
  );
}
