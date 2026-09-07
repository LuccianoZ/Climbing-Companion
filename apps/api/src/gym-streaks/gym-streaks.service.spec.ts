import type { Repository } from 'typeorm';
import { GymStreaksService } from './gym-streaks.service';
import { GymStreak } from './entities/gym-streak.entity';

describe('GymStreaksService', () => {
  const userId = 'user-1';
  const gymId = 'gym-1';

  describe('periodOf', () => {
    it('encodes year*12 + month (1-indexed)', () => {
      expect(GymStreaksService.periodOf(new Date('2026-08-15T00:00:00Z'))).toBe(
        2026 * 12 + 8,
      );
    });

    it('spans a Dec -> Jan rollover as a plain difference of 1', () => {
      const dec = GymStreaksService.periodOf(new Date('2026-12-31T00:00:00Z'));
      const jan = GymStreaksService.periodOf(new Date('2027-01-01T00:00:00Z'));
      expect(jan - dec).toBe(1);
    });
  });

  describe('recordCheckIn', () => {
    let streakRepo: {
      findOne: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      save: ReturnType<typeof vi.fn>;
    };
    let manager: { getRepository: ReturnType<typeof vi.fn> };
    let service: GymStreaksService;

    beforeEach(() => {
      streakRepo = {
        findOne: vi.fn(),
        create: vi.fn((data: Partial<GymStreak>) => ({ ...data }) as GymStreak),
        save: vi.fn((streak: GymStreak) => streak),
      };
      manager = { getRepository: vi.fn(() => streakRepo) };
      service = new GymStreaksService({} as Repository<GymStreak>);
    });

    it('starts a streak at 1 on a gym"s first check-in', async () => {
      streakRepo.findOne.mockResolvedValue(undefined);

      await service.recordCheckIn(
        manager as never,
        userId,
        gymId,
        new Date('2026-08-15T00:00:00Z'),
      );

      expect(streakRepo.create).toHaveBeenCalledWith({
        userId,
        gymId,
        currentStreakMonths: 1,
        lastCountedPeriod: 2026 * 12 + 8,
      });
    });

    it('does not double-count a second check-in in the same month', async () => {
      const existing = {
        userId,
        gymId,
        currentStreakMonths: 2,
        lastCountedPeriod: 2026 * 12 + 8,
      } as GymStreak;
      streakRepo.findOne.mockResolvedValue(existing);

      await service.recordCheckIn(
        manager as never,
        userId,
        gymId,
        new Date('2026-08-28T00:00:00Z'),
      );

      expect(streakRepo.save).not.toHaveBeenCalled();
      expect(existing.currentStreakMonths).toBe(2);
    });

    it('extends the streak on a check-in in the next consecutive month', async () => {
      const existing = {
        userId,
        gymId,
        currentStreakMonths: 2,
        lastCountedPeriod: 2026 * 12 + 8,
      } as GymStreak;
      streakRepo.findOne.mockResolvedValue(existing);

      await service.recordCheckIn(
        manager as never,
        userId,
        gymId,
        new Date('2026-09-05T00:00:00Z'),
      );

      expect(existing.currentStreakMonths).toBe(3);
      expect(existing.lastCountedPeriod).toBe(2026 * 12 + 9);
      expect(streakRepo.save).toHaveBeenCalledWith(existing);
    });

    it('extends across a Dec -> Jan year boundary', async () => {
      const existing = {
        userId,
        gymId,
        currentStreakMonths: 5,
        lastCountedPeriod: 2026 * 12 + 12,
      } as GymStreak;
      streakRepo.findOne.mockResolvedValue(existing);

      await service.recordCheckIn(
        manager as never,
        userId,
        gymId,
        new Date('2027-01-10T00:00:00Z'),
      );

      expect(existing.currentStreakMonths).toBe(6);
      expect(existing.lastCountedPeriod).toBe(2027 * 12 + 1);
    });

    it('resets to 1 after a skipped month', async () => {
      const existing = {
        userId,
        gymId,
        currentStreakMonths: 4,
        lastCountedPeriod: 2026 * 12 + 6,
      } as GymStreak;
      streakRepo.findOne.mockResolvedValue(existing);

      await service.recordCheckIn(
        manager as never,
        userId,
        gymId,
        new Date('2026-09-01T00:00:00Z'),
      );

      expect(existing.currentStreakMonths).toBe(1);
      expect(existing.lastCountedPeriod).toBe(2026 * 12 + 9);
    });
  });

  describe('listVisibleStreaks', () => {
    let repo: { manager: { query: ReturnType<typeof vi.fn> } };
    let service: GymStreaksService;

    beforeEach(() => {
      repo = { manager: { query: vi.fn().mockResolvedValue([]) } };
      service = new GymStreaksService(repo as unknown as Repository<GymStreak>);
    });

    it('returns joined streak/gym-name rows for the owner/a friend', async () => {
      await service.listVisibleStreaks(userId, true);
      expect(repo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('gym_streaks'),
        [userId],
      );
    });

    it('returns nothing for a non-friend, regardless of any public flag', async () => {
      const result = await service.listVisibleStreaks(userId, false);
      expect(result).toEqual([]);
      expect(repo.manager.query).not.toHaveBeenCalled();
    });
  });
});
