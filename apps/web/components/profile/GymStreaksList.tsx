import type { GymStreakView } from '@/lib/types';

// BL-x10 (AR-53, Sept 7 2026). Per-gym, current-streak-only. Visible only to
// the owner and their accepted friends (never public) -- this component
// only ever renders once the caller already knows the viewer is allowed to
// see it (GymActivityService already returned an empty array otherwise).
export function GymStreaksList({ streaks }: { streaks: GymStreakView[] }) {
  if (streaks.length === 0) {
    return (
      <p
        data-testid="gym-streaks-empty"
        className="text-[12px] text-ink-faint"
      >
        No active streaks yet — check in at the same gym in consecutive
        months to start one.
      </p>
    );
  }

  return (
    <ul data-testid="gym-streaks-list" className="space-y-2">
      {streaks.map((streak) => (
        <li
          key={streak.gymId}
          data-testid="gym-streak-row"
          className="flex items-center justify-between rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2"
        >
          <span className="text-[12px] font-bold text-ink">
            {streak.gymName}
          </span>
          <span className="text-[12px] font-extrabold text-clay-deep">
            {streak.currentStreakMonths}-month streak
          </span>
        </li>
      ))}
    </ul>
  );
}
