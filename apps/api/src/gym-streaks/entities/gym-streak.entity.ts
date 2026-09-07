import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// Architecture.md §5 `gym_streaks`, AR-53 (Sept 7, 2026). Tracked per
// user+gym, current-streak-only (no longest-streak column, per the Owner's
// explicit choice). `lastCountedPeriod` is `year * 12 + month` of the last
// check-in counted -- a plain integer difference of 1 spans a Dec->Jan
// rollover with no calendar-aware date math (GymStreaksService.periodOf).
//
// Unlike `gym_badges`, this has no permanence requirement -- plain
// ON DELETE CASCADE on both FKs (see the migration).
@Entity('gym_streaks')
export class GymStreak {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'gym_id', type: 'uuid' })
  gymId: string;

  @Column({ name: 'current_streak_months', type: 'smallint', default: 0 })
  currentStreakMonths: number;

  @Column({ name: 'last_counted_period', type: 'smallint' })
  lastCountedPeriod: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
