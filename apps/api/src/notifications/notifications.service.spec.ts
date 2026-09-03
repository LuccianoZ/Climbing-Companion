import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { EntityManager, Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { ListNotificationsDto } from './dto/list-notifications.dto';

describe('ListNotificationsDto validation', () => {
  it('accepts an omitted since', async () => {
    const errors = await validate(plainToInstance(ListNotificationsDto, {}));
    expect(errors).toHaveLength(0);
  });

  it('accepts an ISO-8601 since', async () => {
    const errors = await validate(
      plainToInstance(ListNotificationsDto, {
        since: '2026-09-01T00:00:00.000Z',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-timestamp since', async () => {
    const errors = await validate(
      plainToInstance(ListNotificationsDto, { since: 'yesterday' }),
    );
    expect(errors.some((e) => e.property === 'since')).toBe(true);
  });
});

describe('NotificationsService', () => {
  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  let managerRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let service: NotificationsService;

  beforeEach(() => {
    repo = {
      create: vi.fn((d: Partial<Notification>) => ({ ...d }) as Notification),
      save: vi.fn((n: Notification) => ({ ...n, id: 'notif-1' })),
      find: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    managerRepo = {
      create: vi.fn((d: Partial<Notification>) => ({ ...d }) as Notification),
      save: vi.fn((n: Notification) => ({ ...n, id: 'notif-1' })),
    };
    manager = { getRepository: vi.fn().mockReturnValue(managerRepo) };
    service = new NotificationsService(
      repo as unknown as Repository<Notification>,
    );
  });

  it('createNotification writes through the caller’s EntityManager', async () => {
    await service.createNotification(
      manager as unknown as EntityManager,
      'user-1',
      NotificationType.IMAGE_REJECTED,
      'moderation-action-1',
    );

    expect(manager.getRepository).toHaveBeenCalledWith(Notification);
    expect(managerRepo.create).toHaveBeenCalledWith({
      recipientUserId: 'user-1',
      type: NotificationType.IMAGE_REJECTED,
      relatedEntityId: 'moderation-action-1',
    });
    expect(managerRepo.save).toHaveBeenCalled();
  });

  it('listForUser orders newest first and omits the since filter when absent', async () => {
    await service.listForUser('user-1');
    expect(repo.find).toHaveBeenCalledWith({
      where: { recipientUserId: 'user-1' },
      order: { createdAt: 'DESC' },
    });
  });

  it('listForUser applies a strictly-after filter when since is given', async () => {
    const since = new Date('2026-09-01T00:00:00Z');
    await service.listForUser('user-1', since);
    const arg = repo.find.mock.calls[0][0] as {
      where: { recipientUserId: string; createdAt?: unknown };
    };
    expect(arg.where.recipientUserId).toBe('user-1');
    expect(arg.where.createdAt).toBeDefined();
  });

  it('countForUser proxies the repository count', async () => {
    repo.count.mockResolvedValue(3);
    await expect(service.countForUser('user-1')).resolves.toBe(3);
  });
});
