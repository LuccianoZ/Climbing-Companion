import {
  BadRequestException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import {
  FriendInviteLinksService,
  INVITE_LINK_LIFETIME_MS,
} from './friend-invite-links.service';
import { FriendInviteLink } from './entities/friend-invite-link.entity';
import type { FriendshipsService } from '../friendships/friendships.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

describe('FriendInviteLinksService', () => {
  const creator = 'user-creator';
  const redeemer = 'user-redeemer';

  let linkRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let txLinkRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };
  let friendshipsService: {
    createActiveFriendship: ReturnType<typeof vi.fn>;
  };
  let notificationsService: { createNotification: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let service: FriendInviteLinksService;

  function link(overrides: Partial<FriendInviteLink> = {}): FriendInviteLink {
    return {
      id: 'link-1',
      token: 'tok',
      creatorId: creator,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + INVITE_LINK_LIFETIME_MS),
      consumedAt: null,
      consumedById: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    linkRepo = {
      create: vi.fn(
        (data: Partial<FriendInviteLink>) =>
          ({ id: 'link-1', ...data }) as FriendInviteLink,
      ),
      save: vi.fn((l: FriendInviteLink) => l),
    };
    txLinkRepo = {
      findOne: vi.fn(),
      save: vi.fn((l: FriendInviteLink) => l),
    };
    manager = { getRepository: vi.fn(() => txLinkRepo) };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    friendshipsService = {
      createActiveFriendship: vi.fn().mockResolvedValue({
        friendship: { id: 'friendship-1' },
        alreadyExisted: false,
      }),
    };
    notificationsService = {
      createNotification: vi.fn().mockResolvedValue(undefined),
    };
    config = { get: vi.fn().mockReturnValue('https://climb.example') };

    service = new FriendInviteLinksService(
      linkRepo as unknown as Repository<FriendInviteLink>,
      friendshipsService as unknown as FriendshipsService,
      notificationsService as unknown as NotificationsService,
      config as unknown as ConfigService,
      dataSource as unknown as DataSource,
    );
  });

  describe('create', () => {
    it('mints a link with a high-entropy token, a 7-day expiry, and a full URL', async () => {
      const before = Date.now();
      const result = await service.create(creator);

      expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      expect(result.url).toBe(
        `https://climb.example/friends/invite/${result.token}`,
      );
      const expiry = new Date(result.expiresAt).getTime();
      expect(expiry).toBeGreaterThanOrEqual(before + INVITE_LINK_LIFETIME_MS);
      expect(linkRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ creatorId: creator, consumedAt: null }),
      );
    });

    it('generates a distinct token each call', async () => {
      const a = await service.create(creator);
      const b = await service.create(creator);
      expect(a.token).not.toBe(b.token);
    });
  });

  describe('redeem', () => {
    it('friends the two users, consumes the link, and notifies the creator', async () => {
      txLinkRepo.findOne.mockResolvedValue(link());

      const result = await service.redeem('tok', redeemer);

      expect(friendshipsService.createActiveFriendship).toHaveBeenCalledWith(
        manager,
        creator,
        redeemer,
      );
      const saved = txLinkRepo.save.mock.calls[0][0] as FriendInviteLink;
      expect(saved.consumedAt).toBeInstanceOf(Date);
      expect(saved.consumedById).toBe(redeemer);
      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        manager,
        creator,
        NotificationType.FRIEND_ADDED,
        'friendship-1',
      );
      expect(result).toEqual({
        outcome: 'FRIENDED',
        friendshipId: 'friendship-1',
        friendUserId: creator,
      });
    });

    it('404s an unknown token', async () => {
      txLinkRepo.findOne.mockResolvedValue(null);
      await expect(service.redeem('nope', redeemer)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('410s an already-consumed link', async () => {
      txLinkRepo.findOne.mockResolvedValue(
        link({ consumedAt: new Date(), consumedById: 'someone' }),
      );
      await expect(service.redeem('tok', redeemer)).rejects.toThrow(
        GoneException,
      );
    });

    it('410s an expired link', async () => {
      txLinkRepo.findOne.mockResolvedValue(
        link({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.redeem('tok', redeemer)).rejects.toThrow(
        GoneException,
      );
    });

    it('400s the creator redeeming their own link', async () => {
      txLinkRepo.findOne.mockResolvedValue(link());
      await expect(service.redeem('tok', creator)).rejects.toThrow(
        BadRequestException,
      );
      expect(friendshipsService.createActiveFriendship).not.toHaveBeenCalled();
    });

    it('is idempotent when the two are already friends: consumes the link, no new friendship, no notification', async () => {
      txLinkRepo.findOne.mockResolvedValue(link());
      friendshipsService.createActiveFriendship.mockResolvedValue({
        friendship: { id: 'friendship-existing' },
        alreadyExisted: true,
      });

      const result = await service.redeem('tok', redeemer);

      expect(result.outcome).toBe('ALREADY_FRIENDS');
      expect(txLinkRepo.save).toHaveBeenCalled();
      expect(notificationsService.createNotification).not.toHaveBeenCalled();
    });

    it('locks the link row FOR UPDATE so concurrent redemptions serialise', async () => {
      txLinkRepo.findOne.mockResolvedValue(link());
      await service.redeem('tok', redeemer);
      expect(txLinkRepo.findOne).toHaveBeenCalledWith({
        where: { token: 'tok' },
        lock: { mode: 'pessimistic_write' },
      });
    });
  });
});
