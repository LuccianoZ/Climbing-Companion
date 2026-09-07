import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { FriendshipsService } from './friendships.service';
import { Friendship, FriendshipStatus } from './entities/friendship.entity';
import type { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

describe('FriendshipsService', () => {
  const userA = 'user-a';
  const userB = 'user-b';

  let friendshipRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    manager: { query: ReturnType<typeof vi.fn> };
  };
  let notificationsService: { createNotification: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let txRepo: {
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let service: FriendshipsService;

  beforeEach(() => {
    friendshipRepo = {
      findOne: vi.fn(),
      save: vi.fn((f: Friendship) => f),
      create: vi.fn((data: Partial<Friendship>) => ({ ...data }) as Friendship),
      delete: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      manager: { query: vi.fn().mockResolvedValue([]) },
    };
    txRepo = {
      create: vi.fn(
        (data: Partial<Friendship>) =>
          ({ id: 'friendship-1', ...data }) as Friendship,
      ),
      save: vi.fn((f: Friendship) => f),
    };
    manager = { getRepository: vi.fn(() => txRepo) };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    notificationsService = {
      createNotification: vi.fn().mockResolvedValue(undefined),
    };
    service = new FriendshipsService(
      friendshipRepo as unknown as Repository<Friendship>,
      notificationsService as unknown as NotificationsService,
      dataSource as unknown as DataSource,
    );
  });

  describe('sendRequest', () => {
    it('rejects a self-request', async () => {
      await expect(service.sendRequest(userA, userA)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a PENDING row and notifies the addressee', async () => {
      friendshipRepo.findOne.mockResolvedValue(undefined);

      const result = await service.sendRequest(userA, userB);

      expect(txRepo.create).toHaveBeenCalledWith({
        requesterId: userA,
        addresseeId: userB,
      });
      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        manager,
        userB,
        NotificationType.FRIEND_REQUEST_RECEIVED,
        'friendship-1',
      );
      expect(result.id).toBe('friendship-1');
    });

    it('rejects a duplicate request in the same direction', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        requesterId: userA,
        addresseeId: userB,
      });

      await expect(service.sendRequest(userA, userB)).rejects.toThrow(
        ConflictException,
      );
    });

    it('checks both directions of the pair (AR-5)', async () => {
      friendshipRepo.findOne.mockResolvedValue(undefined);

      await service.sendRequest(userA, userB);

      expect(friendshipRepo.findOne).toHaveBeenCalledWith({
        where: [
          { requesterId: userA, addresseeId: userB },
          { requesterId: userB, addresseeId: userA },
        ],
      });
    });
  });

  describe('accept', () => {
    it('flips a PENDING request to ACTIVE when the addressee accepts', async () => {
      const friendship = {
        id: 'f1',
        requesterId: userA,
        addresseeId: userB,
        status: FriendshipStatus.PENDING,
        respondedAt: null,
      } as Friendship;
      friendshipRepo.findOne.mockResolvedValue(friendship);

      const result = await service.accept('f1', userB);

      expect(result.status).toBe(FriendshipStatus.ACTIVE);
      expect(result.respondedAt).toBeInstanceOf(Date);
    });

    it('rejects when the acting user is not the addressee', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        id: 'f1',
        requesterId: userA,
        addresseeId: userB,
        status: FriendshipStatus.PENDING,
      });

      await expect(service.accept('f1', userA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for a missing request', async () => {
      friendshipRepo.findOne.mockResolvedValue(undefined);
      await expect(service.accept('missing', userB)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('lets the addressee decline a PENDING request', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        id: 'f1',
        requesterId: userA,
        addresseeId: userB,
        status: FriendshipStatus.PENDING,
      });

      await service.remove('f1', userB);
      expect(friendshipRepo.delete).toHaveBeenCalledWith('f1');
    });

    it('rejects the requester trying to decline their own PENDING request', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        id: 'f1',
        requesterId: userA,
        addresseeId: userB,
        status: FriendshipStatus.PENDING,
      });

      await expect(service.remove('f1', userA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets either party unilaterally unadd an ACTIVE friendship', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        id: 'f1',
        requesterId: userA,
        addresseeId: userB,
        status: FriendshipStatus.ACTIVE,
      });

      await service.remove('f1', userA);
      expect(friendshipRepo.delete).toHaveBeenCalledWith('f1');
    });

    it('rejects a non-party', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        id: 'f1',
        requesterId: userA,
        addresseeId: userB,
        status: FriendshipStatus.ACTIVE,
      });

      await expect(service.remove('f1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for a missing friendship', async () => {
      friendshipRepo.findOne.mockResolvedValue(undefined);
      await expect(service.remove('missing', userA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listPendingForUser', () => {
    it('queries PENDING requests addressed to the user, joined with the requester', async () => {
      await service.listPendingForUser(userB);

      expect(friendshipRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('PENDING'),
        [userB],
      );
    });

    it('returns the joined rows as-is', async () => {
      const rows = [
        {
          id: 'f1',
          requesterId: userA,
          requesterEmail: 'a@example.com',
          requesterDisplayName: 'Alex',
          createdAt: '2026-09-07T00:00:00.000Z',
        },
      ];
      friendshipRepo.manager.query.mockResolvedValue(rows);

      await expect(service.listPendingForUser(userB)).resolves.toEqual(rows);
    });
  });

  describe('areFriends', () => {
    it('returns true for an ACTIVE friendship in either direction', async () => {
      friendshipRepo.findOne.mockResolvedValue({
        status: FriendshipStatus.ACTIVE,
      });
      await expect(service.areFriends(userA, userB)).resolves.toBe(true);
    });

    it('returns false when no ACTIVE row exists', async () => {
      friendshipRepo.findOne.mockResolvedValue(undefined);
      await expect(service.areFriends(userA, userB)).resolves.toBe(false);
    });
  });
});
