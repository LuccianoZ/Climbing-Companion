import type { Repository } from 'typeorm';
import { GymBadgesService } from './gym-badges.service';
import { GymBadge } from './entities/gym-badge.entity';

describe('GymBadgesService', () => {
  const userId = 'user-1';
  const gymId = 'gym-1';
  const earnedAt = new Date('2026-09-07T12:00:00Z');

  describe('computeInitials', () => {
    it('takes the uppercase first letter of each word', () => {
      expect(GymBadgesService.computeInitials('Chalk Line Bouldering')).toBe(
        'CLB',
      );
    });

    it('handles a single-word gym name', () => {
      expect(GymBadgesService.computeInitials('Movement')).toBe('M');
    });

    it('collapses extra whitespace', () => {
      expect(GymBadgesService.computeInitials('  The   Cliffs  ')).toBe('TC');
    });

    it('caps at 8 characters', () => {
      expect(
        GymBadgesService.computeInitials(
          'One Two Three Four Five Six Seven Eight Nine',
        ),
      ).toHaveLength(8);
    });

    it('falls back to "?" for an empty name', () => {
      expect(GymBadgesService.computeInitials('   ')).toBe('?');
    });
  });

  describe('mintIfAbsent', () => {
    let badgeRepo: {
      findOne: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      save: ReturnType<typeof vi.fn>;
    };
    let manager: { getRepository: ReturnType<typeof vi.fn> };
    let service: GymBadgesService;

    beforeEach(() => {
      badgeRepo = {
        findOne: vi.fn(),
        create: vi.fn((data: Partial<GymBadge>) => ({ ...data }) as GymBadge),
        save: vi.fn((badge: GymBadge) => badge),
      };
      manager = {
        getRepository: vi.fn(() => badgeRepo),
      };
      service = new GymBadgesService({} as Repository<GymBadge>);
    });

    it('mints a badge with a name/initials snapshot on a first visit', async () => {
      badgeRepo.findOne.mockResolvedValue(undefined);

      await service.mintIfAbsent(
        manager as never,
        userId,
        gymId,
        'Chalk Line Bouldering',
        earnedAt,
      );

      expect(badgeRepo.create).toHaveBeenCalledWith({
        userId,
        gymId,
        gymNameSnapshot: 'Chalk Line Bouldering',
        gymInitialsSnapshot: 'CLB',
        earnedAt,
      });
      expect(badgeRepo.save).toHaveBeenCalled();
    });

    it('does not mint a second badge for a repeat visit', async () => {
      badgeRepo.findOne.mockResolvedValue({
        id: 'badge-1',
        userId,
        gymId,
      });

      await service.mintIfAbsent(
        manager as never,
        userId,
        gymId,
        'Chalk Line Bouldering',
        earnedAt,
      );

      expect(badgeRepo.create).not.toHaveBeenCalled();
      expect(badgeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('listVisibleBadges', () => {
    let repo: { find: ReturnType<typeof vi.fn> };
    let service: GymBadgesService;

    beforeEach(() => {
      repo = { find: vi.fn().mockResolvedValue([]) };
      service = new GymBadgesService(repo as unknown as Repository<GymBadge>);
    });

    it('returns the shelf for the owner viewing themself, badgesPublic or not', async () => {
      await service.listVisibleBadges(userId, false, true);
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId },
        order: { earnedAt: 'ASC' },
      });
    });

    it('returns the shelf for a friend even when badgesPublic is false', async () => {
      await service.listVisibleBadges(userId, false, true);
      expect(repo.find).toHaveBeenCalled();
    });

    it('returns the shelf for a non-friend when badgesPublic is true', async () => {
      await service.listVisibleBadges(userId, true, false);
      expect(repo.find).toHaveBeenCalled();
    });

    it('returns nothing for a non-friend when badgesPublic is false', async () => {
      const result = await service.listVisibleBadges(userId, false, false);
      expect(result).toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });
  });
});
