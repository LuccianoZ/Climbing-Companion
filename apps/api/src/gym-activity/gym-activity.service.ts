import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { FriendshipsService } from '../friendships/friendships.service';
import { GymBadgesService } from '../gym-badges/gym-badges.service';
import {
  GymStreaksService,
  GymStreakView,
} from '../gym-streaks/gym-streaks.service';
import { GymBadge } from '../gym-badges/entities/gym-badge.entity';

export interface GymActivity {
  badges: GymBadge[];
  streaks: GymStreakView[];
  // Echoed back so a self-view can render the toggle's current state
  // without a second round trip; harmless to include for any viewer since
  // it's a boolean setting, not private data.
  badgesPublic: boolean;
  isOwnProfile: boolean;
}

// Foundation §12 "Analytics -- Indoor" (revised Sept 7, 2026), AR-53.
// Aggregates BL-x09/x10's two independent visibility rules behind one
// profile read: badges gate on `badgesPublic` unless the viewer is the
// owner or a friend; streaks are friends/self-only, full stop.
@Injectable()
export class GymActivityService {
  constructor(
    private readonly usersService: UsersService,
    private readonly friendshipsService: FriendshipsService,
    private readonly gymBadgesService: GymBadgesService,
    private readonly gymStreaksService: GymStreaksService,
  ) {}

  async getActivityForProfile(
    ownerId: string,
    viewerId: string,
  ): Promise<GymActivity> {
    const owner = await this.usersService.findById(ownerId);
    if (!owner) {
      throw new NotFoundException(`User "${ownerId}" not found`);
    }

    const viewerIsFriendOrSelf =
      viewerId === ownerId ||
      (await this.friendshipsService.areFriends(viewerId, ownerId));

    const [badges, streaks] = await Promise.all([
      this.gymBadgesService.listVisibleBadges(
        ownerId,
        owner.badgesPublic,
        viewerIsFriendOrSelf,
      ),
      this.gymStreaksService.listVisibleStreaks(ownerId, viewerIsFriendOrSelf),
    ]);

    return {
      badges,
      streaks,
      badgesPublic: owner.badgesPublic,
      isOwnProfile: viewerId === ownerId,
    };
  }
}
