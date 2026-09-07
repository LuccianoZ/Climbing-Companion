import { NotFoundException } from '@nestjs/common';
import { GymActivityService } from './gym-activity.service';
import type { UsersService } from '../users/users.service';
import type { FriendshipsService } from '../friendships/friendships.service';
import type { GymBadgesService } from '../gym-badges/gym-badges.service';
import type { GymStreaksService } from '../gym-streaks/gym-streaks.service';

describe('GymActivityService', () => {
  const ownerId = 'owner-1';
  const viewerId = 'viewer-1';

  let usersService: { findById: ReturnType<typeof vi.fn> };
  let friendshipsService: { areFriends: ReturnType<typeof vi.fn> };
  let gymBadgesService: { listVisibleBadges: ReturnType<typeof vi.fn> };
  let gymStreaksService: { listVisibleStreaks: ReturnType<typeof vi.fn> };
  let service: GymActivityService;

  beforeEach(() => {
    usersService = {
      findById: vi.fn().mockResolvedValue({
        id: ownerId,
        badgesPublic: true,
      }),
    };
    friendshipsService = { areFriends: vi.fn().mockResolvedValue(false) };
    gymBadgesService = { listVisibleBadges: vi.fn().mockResolvedValue([]) };
    gymStreaksService = { listVisibleStreaks: vi.fn().mockResolvedValue([]) };
    service = new GymActivityService(
      usersService as unknown as UsersService,
      friendshipsService as unknown as FriendshipsService,
      gymBadgesService as unknown as GymBadgesService,
      gymStreaksService as unknown as GymStreaksService,
    );
  });

  it('throws NotFoundException for a missing owner', async () => {
    usersService.findById.mockResolvedValue(null);
    await expect(
      service.getActivityForProfile(ownerId, viewerId),
    ).rejects.toThrow(NotFoundException);
  });

  it('echoes badgesPublic and isOwnProfile in the result', async () => {
    const result = await service.getActivityForProfile(ownerId, viewerId);
    expect(result.badgesPublic).toBe(true);
    expect(result.isOwnProfile).toBe(false);

    const own = await service.getActivityForProfile(ownerId, ownerId);
    expect(own.isOwnProfile).toBe(true);
  });

  it('treats the owner viewing their own profile as friend-or-self, skipping the friendship lookup', async () => {
    await service.getActivityForProfile(ownerId, ownerId);

    expect(friendshipsService.areFriends).not.toHaveBeenCalled();
    expect(gymBadgesService.listVisibleBadges).toHaveBeenCalledWith(
      ownerId,
      true,
      true,
    );
    expect(gymStreaksService.listVisibleStreaks).toHaveBeenCalledWith(
      ownerId,
      true,
    );
  });

  it('checks the friendship table for a different viewer', async () => {
    friendshipsService.areFriends.mockResolvedValue(true);

    await service.getActivityForProfile(ownerId, viewerId);

    expect(friendshipsService.areFriends).toHaveBeenCalledWith(
      viewerId,
      ownerId,
    );
    expect(gymBadgesService.listVisibleBadges).toHaveBeenCalledWith(
      ownerId,
      true,
      true,
    );
    expect(gymStreaksService.listVisibleStreaks).toHaveBeenCalledWith(
      ownerId,
      true,
    );
  });

  it('passes viewerIsFriendOrSelf=false through to both services for a non-friend', async () => {
    friendshipsService.areFriends.mockResolvedValue(false);

    await service.getActivityForProfile(ownerId, viewerId);

    expect(gymBadgesService.listVisibleBadges).toHaveBeenCalledWith(
      ownerId,
      true,
      false,
    );
    expect(gymStreaksService.listVisibleStreaks).toHaveBeenCalledWith(
      ownerId,
      false,
    );
  });
});
