import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ModerationService } from './moderation.service';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from '../media/entities/media-asset.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { MediaReport } from './entities/media-report.entity';
import {
  MediaModerationAction,
  ModerationDecision,
  ModerationReasonPreset,
} from './entities/media-moderation-action.entity';
import {
  AccountabilityAction,
  UserAccountabilityAction,
} from './entities/user-accountability-action.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import type { MailService } from '../mail/mail.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { VerificationService } from '../verifications/verification.service';
import type { ModerateMediaDto } from './dto/moderate-media.dto';

describe('ModerationService', () => {
  let assetRepo: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let reportRepo: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let moderationActionRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let accountabilityRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let userRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let manager: { getRepository: ReturnType<typeof vi.fn> };
  let dataSource: {
    transaction: ReturnType<typeof vi.fn>;
    getRepository: ReturnType<typeof vi.fn>;
  };
  let mail: { sendModerationEmail: ReturnType<typeof vi.fn> };
  let notifications: { createNotification: ReturnType<typeof vi.fn> };
  let verificationService: {
    voidRouteVerificationByPhoto: ReturnType<typeof vi.fn>;
    voidGymVerificationByPhoto: ReturnType<typeof vi.fn>;
  };
  let service: ModerationService;

  const adminId = 'admin-1';
  const assetId = 'asset-1';
  const ownerId = 'owner-1';

  function baseAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
    return {
      id: assetId,
      ownerUserId: ownerId,
      purpose: MediaPurpose.REVIEW_PHOTO,
      payload: Buffer.from('x'),
      mimeType: 'image/jpeg',
      byteSize: 10,
      moderationStatus: MediaModerationStatus.PENDING,
      subjectRouteId: null,
      subjectGymId: null,
      etag: 'etag',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...overrides,
    };
  }

  function baseUser(overrides: Partial<User> = {}): User {
    return {
      id: ownerId,
      email: 'owner@example.com',
      strikeCount: 0,
      isBanned: false,
      bannedAt: null,
      role: UserRole.VERIFIED_USER,
      ...overrides,
    } as User;
  }

  function repoFor(entity: unknown) {
    if (entity === MediaAsset) return assetRepo;
    if (entity === MediaReport) return reportRepo;
    if (entity === MediaModerationAction) return moderationActionRepo;
    if (entity === UserAccountabilityAction) return accountabilityRepo;
    if (entity === User) return userRepo;
    throw new Error('unexpected repository requested');
  }

  beforeEach(() => {
    assetRepo = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      save: vi.fn((a: MediaAsset) => a),
    };
    reportRepo = {
      findOne: vi.fn(),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((d: Partial<MediaReport>) => ({ ...d }) as MediaReport),
      save: vi.fn((r: MediaReport) => ({ ...r, id: 'report-1' })),
    };
    moderationActionRepo = {
      create: vi.fn(
        (d: Partial<MediaModerationAction>) =>
          ({ ...d }) as MediaModerationAction,
      ),
      save: vi.fn((r: MediaModerationAction) => ({
        ...r,
        id: 'moderation-action-1',
      })),
    };
    accountabilityRepo = {
      create: vi.fn(
        (d: Partial<UserAccountabilityAction>) =>
          ({ ...d }) as UserAccountabilityAction,
      ),
      save: vi.fn((r: UserAccountabilityAction) => ({
        ...r,
        id: 'accountability-1',
      })),
    };
    userRepo = { findOne: vi.fn(), save: vi.fn((u: User) => u) };
    manager = { getRepository: vi.fn(repoFor) };
    dataSource = {
      transaction: vi.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
      getRepository: vi.fn(repoFor),
    };
    mail = { sendModerationEmail: vi.fn() };
    notifications = { createNotification: vi.fn() };
    verificationService = {
      voidRouteVerificationByPhoto: vi.fn().mockResolvedValue({
        voided: true,
        routeReverted: false,
        cragReverted: false,
        routeId: 'route-1',
      }),
      voidGymVerificationByPhoto: vi.fn().mockResolvedValue({
        voided: true,
        gymReverted: false,
        gymId: 'gym-1',
      }),
    };
    service = new ModerationService(
      dataSource as unknown as DataSource,
      mail as unknown as MailService,
      notifications as unknown as NotificationsService,
      verificationService as unknown as VerificationService,
    );
  });

  const approveDto: ModerateMediaDto = { decision: ModerationDecision.APPROVE };

  describe('getFlagQueue', () => {
    it('returns an empty list when nothing is pending', async () => {
      assetRepo.find.mockResolvedValue([]);
      await expect(service.getFlagQueue()).resolves.toEqual([]);
    });

    it('nests each asset’s reports under it, oldest asset first', async () => {
      assetRepo.find.mockResolvedValue([
        baseAsset({ id: 'asset-a' }),
        baseAsset({ id: 'asset-b' }),
      ]);
      reportRepo.find.mockResolvedValue([
        {
          id: 'r1',
          mediaAssetId: 'asset-b',
          reportedBy: 'u1',
          reason: 'spam',
          createdAt: new Date('2026-09-02T00:00:00Z'),
        },
      ]);

      const queue = await service.getFlagQueue();

      expect(queue.map((i) => i.mediaAssetId)).toEqual(['asset-a', 'asset-b']);
      expect(queue[0].reports).toEqual([]);
      expect(queue[1].reports).toHaveLength(1);
      expect(queue[1].reports[0].reason).toBe('spam');
    });
  });

  describe('moderateMediaAsset - guards', () => {
    it('throws NotFoundException for an unknown asset', async () => {
      assetRepo.findOne.mockResolvedValue(null);
      await expect(
        service.moderateMediaAsset(adminId, assetId, approveDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the asset is not PENDING', async () => {
      assetRepo.findOne.mockResolvedValue(
        baseAsset({ moderationStatus: MediaModerationStatus.APPROVED }),
      );
      await expect(
        service.moderateMediaAsset(adminId, assetId, approveDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('APPROVE', () => {
    it('publishes the asset and records the action with no reason, no side effects', async () => {
      assetRepo.findOne.mockResolvedValue(baseAsset());

      const result = await service.moderateMediaAsset(
        adminId,
        assetId,
        approveDto,
      );

      expect(result.assetStatus).toBe(MediaModerationStatus.APPROVED);
      expect(assetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          moderationStatus: MediaModerationStatus.APPROVED,
        }),
      );
      expect(moderationActionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: ModerationDecision.APPROVE,
          reasonPreset: null,
          reasonText: null,
        }),
      );
      expect(accountabilityRepo.save).not.toHaveBeenCalled();
      expect(notifications.createNotification).not.toHaveBeenCalled();
      expect(mail.sendModerationEmail).not.toHaveBeenCalled();
    });
  });

  describe('REJECT - ordinary asset', () => {
    it('rejects with no reason and no strike, raising only the IMAGE_REJECTED alert', async () => {
      assetRepo.findOne.mockResolvedValue(baseAsset());
      userRepo.findOne.mockResolvedValue(baseUser());

      const result = await service.moderateMediaAsset(adminId, assetId, {
        decision: ModerationDecision.REJECT,
      });

      expect(result.assetStatus).toBe(MediaModerationStatus.REJECTED);
      expect(result.strikeIssued).toBe(false);
      expect(accountabilityRepo.save).not.toHaveBeenCalled();
      expect(notifications.createNotification).toHaveBeenCalledWith(
        manager,
        ownerId,
        NotificationType.IMAGE_REJECTED,
        'moderation-action-1',
      );
      expect(mail.sendModerationEmail).toHaveBeenCalledWith(
        'owner@example.com',
        'IMAGE_REJECTED',
        expect.any(String),
      );
    });

    it('requires a reason once a strike is paired with the reject', async () => {
      assetRepo.findOne.mockResolvedValue(baseAsset());
      userRepo.findOne.mockResolvedValue(baseUser());

      await expect(
        service.moderateMediaAsset(adminId, assetId, {
          decision: ModerationDecision.REJECT,
          pairedAction: AccountabilityAction.ISSUE_STRIKE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects OTHER preset without freehand text', async () => {
      assetRepo.findOne.mockResolvedValue(baseAsset());
      userRepo.findOne.mockResolvedValue(baseUser());

      await expect(
        service.moderateMediaAsset(adminId, assetId, {
          decision: ModerationDecision.REJECT,
          pairedAction: AccountabilityAction.ISSUE_STRIKE,
          reasonPreset: ModerationReasonPreset.OTHER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Reject + Strike increments strike_count, records the accountability row, emails and notifies', async () => {
      assetRepo.findOne.mockResolvedValue(baseAsset());
      userRepo.findOne.mockResolvedValue(baseUser({ strikeCount: 0 }));

      const result = await service.moderateMediaAsset(adminId, assetId, {
        decision: ModerationDecision.REJECT,
        pairedAction: AccountabilityAction.ISSUE_STRIKE,
        reasonPreset: ModerationReasonPreset.OFF_TOPIC,
      });

      expect(result.strikeIssued).toBe(true);
      expect(result.newStrikeCount).toBe(1);
      expect(result.userBanned).toBe(false);
      expect(accountabilityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AccountabilityAction.ISSUE_STRIKE,
          reasonText: 'Off-topic content',
          triggeringMediaActionId: 'moderation-action-1',
        }),
      );
      expect(mail.sendModerationEmail).toHaveBeenCalledWith(
        'owner@example.com',
        'STRIKE_ISSUED',
        'Off-topic content',
      );
      expect(notifications.createNotification).toHaveBeenCalledWith(
        manager,
        ownerId,
        NotificationType.STRIKE_ISSUED,
        'accountability-1',
      );
    });

    it('auto-bans on the third strike with no BAN_OUTRIGHT row and no in-app ban notification', async () => {
      assetRepo.findOne.mockResolvedValue(baseAsset());
      userRepo.findOne.mockResolvedValue(baseUser({ strikeCount: 2 }));

      const result = await service.moderateMediaAsset(adminId, assetId, {
        decision: ModerationDecision.REJECT,
        pairedAction: AccountabilityAction.ISSUE_STRIKE,
        reasonText: 'third time',
      });

      expect(result.newStrikeCount).toBe(3);
      expect(result.userBanned).toBe(true);
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isBanned: true }),
      );
      const accountabilityTypes = (
        accountabilityRepo.create.mock.calls as unknown[][]
      ).map((c) => (c[0] as UserAccountabilityAction).actionType);
      expect(accountabilityTypes).toEqual([AccountabilityAction.ISSUE_STRIKE]);
      const notifiedTypes = (
        notifications.createNotification.mock.calls as unknown[][]
      ).map((c) => c[2]);
      expect(notifiedTypes).toEqual([
        NotificationType.STRIKE_ISSUED,
        NotificationType.IMAGE_REJECTED,
      ]);
      expect(mail.sendModerationEmail).toHaveBeenCalledWith(
        'owner@example.com',
        'ACCOUNT_BANNED',
        'third time',
      );
    });

    it('Reject + Ban Outright bans immediately regardless of strike count', async () => {
      assetRepo.findOne.mockResolvedValue(baseAsset());
      userRepo.findOne.mockResolvedValue(baseUser({ strikeCount: 0 }));

      const result = await service.moderateMediaAsset(adminId, assetId, {
        decision: ModerationDecision.REJECT,
        pairedAction: AccountabilityAction.BAN_OUTRIGHT,
        reasonText: 'egregious',
      });

      expect(result.userBanned).toBe(true);
      expect(result.strikeIssued).toBe(false);
      expect(accountabilityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AccountabilityAction.BAN_OUTRIGHT,
        }),
      );
      // §12: a ban produces no in-app notification (only IMAGE_REJECTED, for
      // the photo itself).
      const notifiedTypes = (
        notifications.createNotification.mock.calls as unknown[][]
      ).map((c) => c[2]);
      expect(notifiedTypes).toEqual([NotificationType.IMAGE_REJECTED]);
    });
  });

  describe('REJECT - verification photo (AR-1)', () => {
    it('always strikes even with no paired action, and voids the route verification', async () => {
      assetRepo.findOne.mockResolvedValue(
        baseAsset({ purpose: MediaPurpose.ROUTE_VERIFICATION_PHOTO }),
      );
      userRepo.findOne.mockResolvedValue(baseUser({ strikeCount: 0 }));
      verificationService.voidRouteVerificationByPhoto.mockResolvedValue({
        voided: true,
        routeReverted: true,
        cragReverted: true,
        routeId: 'route-1',
      });

      const result = await service.moderateMediaAsset(adminId, assetId, {
        decision: ModerationDecision.REJECT,
        reasonPreset: ModerationReasonPreset.SUSPECTED_FRAUDULENT,
      });

      expect(result.strikeIssued).toBe(true);
      expect(result.verificationVoided).toBe(true);
      expect(result.routeReverted).toBe(true);
      expect(result.cragReverted).toBe(true);
      expect(
        verificationService.voidRouteVerificationByPhoto,
      ).toHaveBeenCalledWith(manager, assetId);
    });

    it('rejecting a verification photo with no reason at all is refused', async () => {
      assetRepo.findOne.mockResolvedValue(
        baseAsset({ purpose: MediaPurpose.ROUTE_VERIFICATION_PHOTO }),
      );
      userRepo.findOne.mockResolvedValue(baseUser());

      await expect(
        service.moderateMediaAsset(adminId, assetId, {
          decision: ModerationDecision.REJECT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('voids the gym verification for a gym-verification photo (AR-47)', async () => {
      assetRepo.findOne.mockResolvedValue(
        baseAsset({ purpose: MediaPurpose.GYM_VERIFICATION_PHOTO }),
      );
      userRepo.findOne.mockResolvedValue(baseUser());
      verificationService.voidGymVerificationByPhoto.mockResolvedValue({
        voided: true,
        gymReverted: true,
        gymId: 'gym-1',
      });

      const result = await service.moderateMediaAsset(adminId, assetId, {
        decision: ModerationDecision.REJECT,
        reasonText: 'staged photo',
      });

      expect(result.gymReverted).toBe(true);
      expect(
        verificationService.voidGymVerificationByPhoto,
      ).toHaveBeenCalledWith(manager, assetId);
    });
  });

  describe('reportAsset', () => {
    it('flips a published asset back to PENDING and records the report', async () => {
      assetRepo.findOne.mockResolvedValue(
        baseAsset({ moderationStatus: MediaModerationStatus.APPROVED }),
      );

      const result = await service.reportAsset('reporter-1', assetId, {
        reason: 'not climbing related',
      });

      expect(result.moderationStatus).toBe(MediaModerationStatus.PENDING);
      expect(reportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reportedBy: 'reporter-1',
          reason: 'not climbing related',
        }),
      );
      expect(assetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          moderationStatus: MediaModerationStatus.PENDING,
        }),
      );
    });

    it('refuses to report an asset that is not published', async () => {
      assetRepo.findOne.mockResolvedValue(
        baseAsset({ moderationStatus: MediaModerationStatus.PENDING }),
      );
      await expect(
        service.reportAsset('reporter-1', assetId, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for an unknown asset', async () => {
      assetRepo.findOne.mockResolvedValue(null);
      await expect(
        service.reportAsset('reporter-1', assetId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
