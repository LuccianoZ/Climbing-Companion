import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

describe('UsersService', () => {
  let repo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let service: UsersService;

  beforeEach(() => {
    repo = {
      findOne: vi.fn(),
      save: vi.fn((user: User) => user),
    };
    service = new UsersService(repo as unknown as Repository<User>);
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      const user = { id: 'u1' } as User;
      repo.findOne.mockResolvedValue(user);
      await expect(service.findById('u1')).resolves.toBe(user);
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById('missing')).resolves.toBeNull();
    });
  });

  describe('setBadgesPublic', () => {
    it('flips the flag and persists it', async () => {
      const user = { id: 'u1', badgesPublic: true } as User;
      repo.findOne.mockResolvedValue(user);

      const result = await service.setBadgesPublic('u1', false);

      expect(result.badgesPublic).toBe(false);
      expect(repo.save).toHaveBeenCalledWith(user);
    });

    it('throws NotFoundException for a missing user', async () => {
      repo.findOne.mockResolvedValue(undefined);
      await expect(service.setBadgesPublic('missing', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
