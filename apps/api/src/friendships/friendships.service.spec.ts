import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { FriendshipsService } from './friendships.service';
import { Friendship, FriendshipStatus } from './entities/friendship.entity';

// AR-55 (Sept 7, 2026 -- Part 2): friendship is invite-link-based. The
// request/accept/decline scenarios that used to live here are gone; what
// remains is createActiveFriendship (the redemption writer), remove
// (unadd), areFriends, and listFriendsForUser.
describe('FriendshipsService', () => {
  const creator = 'user-creator';
  const redeemer = 'user-redeemer';

  let friendshipRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    manager: { query: ReturnType<typeof vi.fn> };
  };
  let txRepo: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let service: FriendshipsService;

  beforeEach(() => {
    txRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(
        (data: Partial<Friendship>) =>
          ({ id: 'friendship-1', ...data }) as Friendship,
      ),
      save: vi.fn((f: Friendship) => f),
    };
    manager = {
      getRepository: vi.fn(() => txRepo),
    };
    friendshipRepo = {
      findOne: vi.fn(),
      save: vi.fn((f: Friendship) => f),
      delete: vi.fn(),
      manager: { query: vi.fn().mockResolvedValue([]) },
    };
    service = new FriendshipsService(
      friendshipRepo as unknown as Repository<Friendship>,
    );
  });

  describe('createActiveFriendship', () => {
    it('inserts an ACTIVE row with responded_at when the pair is new', async () => {
      txRepo.findOne.mockResolvedValue(null);

      const result = await service.createActiveFriendship(
        manager as unknown as EntityManager,
        creator,
        redeemer,
      );

      expect(txRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requesterId: creator,
          addresseeId: redeemer,
          status: FriendshipStatus.ACTIVE,
        }),
      );
      const created = txRepo.create.mock.results[0].value as Friendship;
      expect(created.respondedAt).toBeInstanceOf(Date);
      expect(result.alreadyExisted).toBe(false);
      expect(result.friendship.id).toBe('friendship-1');
    });

    it('checks both directions of the pair (AR-5)', async () => {
      await service.createActiveFriendship(
        manager as unknown as EntityManager,
        creator,
        redeemer,
      );

      expect(txRepo.findOne).toHaveBeenCalledWith({
        where: [
          { requesterId: creator, addresseeId: redeemer },
          { requesterId: redeemer, addresseeId: creator },
        ],
      });
    });

    it('is idempotent when a friendship already exists in the mirrored direction', async () => {
      const existing = {
        id: 'existing-1',
        requesterId: redeemer,
        addresseeId: creator,
        status: FriendshipStatus.ACTIVE,
      } as Friendship;
      txRepo.findOne.mockResolvedValue(existing);

      const result = await service.createActiveFriendship(
        manager as unknown as EntityManager,
        creator,
        redeemer,
      );

      expect(result.alreadyExisted).toBe(true);
      expect(result.friendship).toBe(existing);
      expect(txRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lets a party unadd a friendship', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        id: 'f1',
        requesterId: creator,
        addresseeId: redeemer,
        status: FriendshipStatus.ACTIVE,
      });

      await service.remove('f1', creator);
      expect(friendshipRepo.delete).toHaveBeenCalledWith('f1');
    });

    it('lets the other party unadd it too (unilateral)', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        id: 'f1',
        requesterId: creator,
        addresseeId: redeemer,
        status: FriendshipStatus.ACTIVE,
      });

      await service.remove('f1', redeemer);
      expect(friendshipRepo.delete).toHaveBeenCalledWith('f1');
    });

    it('rejects a non-party', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        id: 'f1',
        requesterId: creator,
        addresseeId: redeemer,
        status: FriendshipStatus.ACTIVE,
      });

      await expect(service.remove('f1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for a missing friendship', async () => {
      friendshipRepo.findOne.mockResolvedValue(undefined);
      await expect(service.remove('missing', creator)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('areFriends', () => {
    it('looks for an ACTIVE friendship in either direction', async () => {
      friendshipRepo.findOne.mockResolvedValue({ id: 'f1' });

      await expect(service.areFriends(creator, redeemer)).resolves.toBe(true);
      expect(friendshipRepo.findOne).toHaveBeenCalledWith({
        where: [
          {
            requesterId: creator,
            addresseeId: redeemer,
            status: FriendshipStatus.ACTIVE,
          },
          {
            requesterId: redeemer,
            addresseeId: creator,
            status: FriendshipStatus.ACTIVE,
          },
        ],
      });
    });

    it('returns false when there is no row', async () => {
      friendshipRepo.findOne.mockResolvedValue(null);
      await expect(service.areFriends(creator, redeemer)).resolves.toBe(false);
    });
  });

  describe('listFriendsForUser', () => {
    it('queries ACTIVE friendships in either direction, joined with users', async () => {
      const rows = [
        {
          friendshipId: 'f1',
          userId: redeemer,
          email: 'r@example.com',
          displayName: 'R',
          since: '2026-09-07T00:00:00.000Z',
        },
      ];
      friendshipRepo.manager.query.mockResolvedValue(rows);

      await expect(service.listFriendsForUser(creator)).resolves.toEqual(rows);
      expect(friendshipRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'ACTIVE'"),
        [creator],
      );
    });
  });
});
