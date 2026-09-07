import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { GymBadge } from './entities/gym-badge.entity';

// Architecture.md §5 `gym_badges`, AR-53 (Sept 7, 2026), BL-x09.
@Injectable()
export class GymBadgesService {
  constructor(
    @InjectRepository(GymBadge)
    private readonly gymBadges: Repository<GymBadge>,
  ) {}

  // Uppercase first letter of each whitespace-separated word in the gym's
  // name, computed once at mint time and never re-derived -- a later gym
  // rename must not change an already-earned badge. Capped at 8 characters
  // (the column width) since nothing in Foundation bounds gym-name word
  // count.
  static computeInitials(gymName: string): string {
    const initials = gymName
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => word[0].toUpperCase())
      .join('');
    return initials.length > 0 ? initials.slice(0, 8) : '?';
  }

  // Called from GymCheckinsService's own transaction (same convention as
  // NotificationsService.createNotification / GradeVoteService.computeConsensus,
  // AR-18/AR-43) so the mint commits atomically with the check-in that
  // triggered it. A no-op past a gym's first check-in for this user --
  // AR-53's "one badge per gym per user, ever, and it never re-mints."
  async mintIfAbsent(
    manager: EntityManager,
    userId: string,
    gymId: string,
    gymName: string,
    earnedAt: Date,
  ): Promise<void> {
    const repo = manager.getRepository(GymBadge);
    const existing = await repo.findOne({ where: { userId, gymId } });
    if (existing) {
      return;
    }

    await repo.save(
      repo.create({
        userId,
        gymId,
        gymNameSnapshot: gymName,
        gymInitialsSnapshot: GymBadgesService.computeInitials(gymName),
        earnedAt,
      }),
    );
  }

  // Profile-page read. `viewerIsFriendOrSelf` decides whether
  // `ownerBadgesPublic` even matters -- friends and the owner always see
  // the shelf regardless of that flag (Foundation §12, Sept 7 2026).
  async listVisibleBadges(
    ownerId: string,
    ownerBadgesPublic: boolean,
    viewerIsFriendOrSelf: boolean,
  ): Promise<GymBadge[]> {
    if (!viewerIsFriendOrSelf && !ownerBadgesPublic) {
      return [];
    }
    return this.gymBadges.find({
      where: { userId: ownerId },
      order: { earnedAt: 'ASC' },
    });
  }
}
