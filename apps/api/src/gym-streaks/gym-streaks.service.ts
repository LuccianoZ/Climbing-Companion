import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { GymStreak } from './entities/gym-streak.entity';

// A streak row alone doesn't say which gym it's for in a renderable way --
// unlike gym_badges, it carries no name snapshot (no permanence
// requirement, AR-53). Joined with `gyms` for display, safe because
// gym_streaks.gym_id is ON DELETE CASCADE: a streak row can never outlive
// its gym.
export interface GymStreakView {
  gymId: string;
  gymName: string;
  currentStreakMonths: number;
}

// Architecture.md §5 `gym_streaks`, AR-53 (Sept 7, 2026), BL-x10.
@Injectable()
export class GymStreaksService {
  constructor(
    @InjectRepository(GymStreak)
    private readonly gymStreaks: Repository<GymStreak>,
  ) {}

  // `year * 12 + month` (1-indexed month) so a Dec->Jan rollover is a plain
  // integer difference of 1 -- no calendar-aware date-diff query needed.
  static periodOf(date: Date): number {
    return date.getUTCFullYear() * 12 + (date.getUTCMonth() + 1);
  }

  // Called from GymCheckinsService's own transaction, same convention as
  // GymBadgesService.mintIfAbsent. Update rule (AR-53): same period as the
  // stored row -> no-op (a second visit in one month doesn't extend the
  // streak); exactly one greater -> increment and advance; any larger gap
  // (or no row yet) -> (re)start at 1.
  async recordCheckIn(
    manager: EntityManager,
    userId: string,
    gymId: string,
    checkedInAt: Date,
  ): Promise<void> {
    const repo = manager.getRepository(GymStreak);
    const period = GymStreaksService.periodOf(checkedInAt);
    const existing = await repo.findOne({ where: { userId, gymId } });

    if (!existing) {
      await repo.save(
        repo.create({
          userId,
          gymId,
          currentStreakMonths: 1,
          lastCountedPeriod: period,
        }),
      );
      return;
    }

    if (period === existing.lastCountedPeriod) {
      return;
    }

    existing.currentStreakMonths =
      period - existing.lastCountedPeriod === 1
        ? existing.currentStreakMonths + 1
        : 1;
    existing.lastCountedPeriod = period;
    await repo.save(existing);
  }

  // Friends/self only, unconditionally (Foundation §12, Sept 7 2026) -- no
  // public-visibility flag exists for streaks, unlike gym_badges.
  async listVisibleStreaks(
    ownerId: string,
    viewerIsFriendOrSelf: boolean,
  ): Promise<GymStreakView[]> {
    if (!viewerIsFriendOrSelf) {
      return [];
    }
    return this.gymStreaks.manager.query(
      `SELECT gs.gym_id AS "gymId", g.name AS "gymName",
              gs.current_streak_months AS "currentStreakMonths"
         FROM gym_streaks gs
         JOIN gyms g ON g.id = gs.gym_id
        WHERE gs.user_id = $1
        ORDER BY gs.current_streak_months DESC`,
      [ownerId],
    );
  }
}
