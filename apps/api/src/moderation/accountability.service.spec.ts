import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DataSource } from 'typeorm';
import { AccountabilityService } from './accountability.service';
import { ApplyAccountabilityActionDto } from './dto/apply-accountability-action.dto';
import { User } from '../users/entities/user.entity';
import {
  UserAccountabilityAction,
  AccountabilityAction,
} from './entities/user-accountability-action.entity';
import { ModerationReasonPreset } from './entities/media-moderation-action.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import type { MailService } from '../mail/mail.service';
import type { NotificationsService } from '../notifications/notifications.service';

describe('ApplyAccountabilityActionDto validation', () => {
  it('accepts an action with a preset reason and no freehand text', async () => {
    const dto = plainToInstance(ApplyAccountabilityActionDto, {
      action: AccountabilityAction.ISSUE_STRIKE,
      reasonPreset: ModerationReasonPreset.SUSPECTED_FRAUDULENT,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an unknown action', async () => {
    const dto = plainToInstance(ApplyAccountabilityActionDto, {
      action: 'NUKE_ACCOUNT',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'action')).toBe(true);
  });

  it('rejects freehand text over the 500-char admin ceiling', async () => {
    const dto = plainToInstance(ApplyAccountabilityActionDto, {
      action: AccountabilityAction.BAN_OUTRIGHT,
      reasonText: 'x'.repeat(501),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'reasonText')).toBe(true);
  });
});

describe('AccountabilityService', () => {
  let userRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let actionRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let dataSource: {
    transaction: ReturnType<typeof vi.fn>;
    getRepository: ReturnType<typeof vi.fn>;
  };
  let mail: { sendModerationEmail: ReturnType<typeof vi.fn> };
  let notifications: { createNotification: ReturnType<typeof vi.fn> };
  let service: AccountabilityService;

  const adminId = 'admin-1';
  const targetId = 'user-1';

  function baseUser(overrides: Partial<User> = {}): User {
    return {
      id: targetId,
      email: 'climber@example.com',
      strikeCount: 0,
      isBanned: false,
      bannedAt: null,
      ...overrides,
    } as User;
  }

  function dto(
    action: AccountabilityAction,
    extra: Partial<ApplyAccountabilityActionDto> = {},
  ): ApplyAccountabilityActionDto {
    return plainToInstance(ApplyAccountabilityActionDto, {
      action,
      reasonText: 'Confirmed fraudulent verification photos.',
      ...extra,
    });
  }

  beforeEach(() => {
    userRepo = { findOne: vi.fn(), save: vi.fn((u: User) => u) };
    let seq = 0;
    actionRepo = {
      create: vi.fn((d: Partial<UserAccountabilityAction>) => ({ ...d })),
      save: vi.fn((a: UserAccountabilityAction) => ({
        ...a,
        id: `action-${++seq}`,
      })),
      find: vi.fn().mockResolvedValue([]),
    };
    manager = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === User) return userRepo;
        if (entity === UserAccountabilityAction) return actionRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
      getRepository: vi.fn((entity: unknown) => {
        if (entity === User) return userRepo;
        if (entity === UserAccountabilityAction) return actionRepo;
        throw new Error('unexpected repository requested');
      }),
    };
    mail = { sendModerationEmail: vi.fn().mockResolvedValue(undefined) };
    notifications = {
      createNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    service = new AccountabilityService(
      dataSource as unknown as DataSource,
      mail as unknown as MailService,
      notifications as unknown as NotificationsService,
    );
  });

  it('throws NotFound when the target user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(
      service.applyAction(
        adminId,
        targetId,
        dto(AccountabilityAction.ISSUE_STRIKE),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an action with neither preset nor freehand reason', async () => {
    userRepo.findOne.mockResolvedValue(baseUser());
    await expect(
      service.applyAction(
        adminId,
        targetId,
        plainToInstance(ApplyAccountabilityActionDto, {
          action: AccountabilityAction.ISSUE_STRIKE,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects the OTHER preset with no freehand text', async () => {
    userRepo.findOne.mockResolvedValue(baseUser());
    await expect(
      service.applyAction(
        adminId,
        targetId,
        plainToInstance(ApplyAccountabilityActionDto, {
          action: AccountabilityAction.ISSUE_STRIKE,
          reasonPreset: ModerationReasonPreset.OTHER,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ISSUE_STRIKE increments the count, records the action, notifies, and emails', async () => {
    userRepo.findOne.mockResolvedValue(baseUser({ strikeCount: 0 }));

    const result = await service.applyAction(
      adminId,
      targetId,
      dto(AccountabilityAction.ISSUE_STRIKE),
    );

    expect(result.strikeCount).toBe(1);
    expect(result.isBanned).toBe(false);
    expect(result.autoBanned).toBe(false);
    expect(actionRepo.save).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      manager,
      targetId,
      NotificationType.STRIKE_ISSUED,
      'action-1',
    );
    expect(mail.sendModerationEmail).toHaveBeenCalledWith(
      'climber@example.com',
      'STRIKE_ISSUED',
      'Confirmed fraudulent verification photos.',
    );
  });

  it('ISSUE_STRIKE that reaches 3 auto-bans: sets isBanned, emails ACCOUNT_BANNED, no ban notification', async () => {
    userRepo.findOne.mockResolvedValue(baseUser({ strikeCount: 2 }));

    const result = await service.applyAction(
      adminId,
      targetId,
      dto(AccountabilityAction.ISSUE_STRIKE),
    );

    expect(result.strikeCount).toBe(3);
    expect(result.isBanned).toBe(true);
    expect(result.autoBanned).toBe(true);
    // one STRIKE_ISSUED notification, none for the ban
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(mail.sendModerationEmail).toHaveBeenCalledWith(
      'climber@example.com',
      'ACCOUNT_BANNED',
      expect.any(String),
    );
  });

  it('REVOKE_STRIKE decrements the count and emails, but does not lift a ban', async () => {
    userRepo.findOne.mockResolvedValue(
      baseUser({ strikeCount: 3, isBanned: true, bannedAt: new Date() }),
    );

    const result = await service.applyAction(
      adminId,
      targetId,
      dto(AccountabilityAction.REVOKE_STRIKE),
    );

    expect(result.strikeCount).toBe(2);
    expect(result.isBanned).toBe(true);
    expect(mail.sendModerationEmail).toHaveBeenCalledWith(
      'climber@example.com',
      'STRIKE_REVOKED',
      expect.any(String),
    );
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('REVOKE_STRIKE on a user with zero strikes is a conflict', async () => {
    userRepo.findOne.mockResolvedValue(baseUser({ strikeCount: 0 }));
    await expect(
      service.applyAction(
        adminId,
        targetId,
        dto(AccountabilityAction.REVOKE_STRIKE),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('BAN_OUTRIGHT bans immediately regardless of strike count, with no notification', async () => {
    userRepo.findOne.mockResolvedValue(baseUser({ strikeCount: 0 }));

    const result = await service.applyAction(
      adminId,
      targetId,
      dto(AccountabilityAction.BAN_OUTRIGHT),
    );

    expect(result.isBanned).toBe(true);
    expect(result.strikeCount).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(mail.sendModerationEmail).toHaveBeenCalledWith(
      'climber@example.com',
      'ACCOUNT_BANNED',
      expect.any(String),
    );
  });

  it('BAN_OUTRIGHT on an already-banned user is a conflict', async () => {
    userRepo.findOne.mockResolvedValue(baseUser({ isBanned: true }));
    await expect(
      service.applyAction(
        adminId,
        targetId,
        dto(AccountabilityAction.BAN_OUTRIGHT),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('RESTORE_ACCOUNT lifts the ban and resets strikes to zero (unified reversal)', async () => {
    userRepo.findOne.mockResolvedValue(
      baseUser({ strikeCount: 3, isBanned: true, bannedAt: new Date() }),
    );

    const result = await service.applyAction(
      adminId,
      targetId,
      dto(AccountabilityAction.RESTORE_ACCOUNT),
    );

    expect(result.isBanned).toBe(false);
    expect(result.strikeCount).toBe(0);
    const saved = userRepo.save.mock.calls[0][0] as User;
    expect(saved.bannedAt).toBeNull();
    expect(mail.sendModerationEmail).toHaveBeenCalledWith(
      'climber@example.com',
      'ACCOUNT_RESTORED',
      expect.any(String),
    );
  });

  it('RESTORE_ACCOUNT on a clean account is a conflict', async () => {
    userRepo.findOne.mockResolvedValue(
      baseUser({ strikeCount: 0, isBanned: false }),
    );
    await expect(
      service.applyAction(
        adminId,
        targetId,
        dto(AccountabilityAction.RESTORE_ACCOUNT),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records a preset-only reason as the preset label text', async () => {
    userRepo.findOne.mockResolvedValue(baseUser());

    await service.applyAction(
      adminId,
      targetId,
      plainToInstance(ApplyAccountabilityActionDto, {
        action: AccountabilityAction.BAN_OUTRIGHT,
        reasonPreset: ModerationReasonPreset.INAPPROPRIATE_EXPLICIT,
      }),
    );

    const createArg = actionRepo.create.mock
      .calls[0][0] as UserAccountabilityAction;
    expect(createArg.reasonText).toBe('Inappropriate/explicit content');
    expect(createArg.reasonPreset).toBe(
      ModerationReasonPreset.INAPPROPRIATE_EXPLICIT,
    );
    expect(createArg.triggeringMediaActionId).toBeNull();
  });

  describe('getUserAudit', () => {
    it('throws NotFound for an unknown user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getUserAudit(targetId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns current state plus newest-first history', async () => {
      userRepo.findOne.mockResolvedValue(
        baseUser({ strikeCount: 1, isBanned: false }),
      );
      actionRepo.find.mockResolvedValue([
        {
          id: 'a2',
          actionType: AccountabilityAction.ISSUE_STRIKE,
          adminUserId: adminId,
          reasonPreset: null,
          reasonText: 'second',
          triggeringMediaActionId: null,
          createdAt: new Date('2026-09-02T00:00:00Z'),
        },
      ]);

      const view = await service.getUserAudit(targetId);

      expect(view.strikeCount).toBe(1);
      expect(view.isBanned).toBe(false);
      expect(view.history).toHaveLength(1);
      expect(view.history[0].id).toBe('a2');
      expect(actionRepo.find).toHaveBeenCalledWith({
        where: { targetUserId: targetId },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
