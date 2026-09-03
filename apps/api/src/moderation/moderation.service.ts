import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from '../media/entities/media-asset.entity';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { VerificationService } from '../verifications/verification.service';
import { MediaReport } from './entities/media-report.entity';
import {
  MediaModerationAction,
  ModerationDecision,
  ModerationReasonPreset,
  MODERATION_REASON_PRESET_LABELS,
} from './entities/media-moderation-action.entity';
import {
  AccountabilityAction,
  UserAccountabilityAction,
} from './entities/user-accountability-action.entity';
import { ModerateMediaDto } from './dto/moderate-media.dto';
import { ReportMediaDto } from './dto/report-media.dto';

// Foundation §11: auto-ban on the third cumulative strike.
const STRIKE_BAN_THRESHOLD = 3;

const VERIFICATION_PURPOSES: readonly MediaPurpose[] = [
  MediaPurpose.ROUTE_VERIFICATION_PHOTO,
  MediaPurpose.GYM_VERIFICATION_PHOTO,
];

export interface FlagQueueReport {
  id: string;
  reportedBy: string;
  reason: string | null;
  createdAt: string;
}

export interface FlagQueueItem {
  mediaAssetId: string;
  ownerUserId: string;
  purpose: MediaPurpose;
  mimeType: string;
  byteSize: number;
  moderationStatus: MediaModerationStatus;
  createdAt: string;
  reports: FlagQueueReport[];
}

export interface ModerationResult {
  decision: ModerationDecision;
  assetStatus: MediaModerationStatus;
  verificationVoided: boolean;
  routeReverted: boolean;
  cragReverted: boolean;
  gymReverted: boolean;
  strikeIssued: boolean;
  newStrikeCount: number | null;
  userBanned: boolean;
}

// A deferred email: collected during the transaction, flushed only after it
// commits, so a mail-transport failure can never roll back a moderation
// action that has otherwise fully succeeded (the DB is the record of truth;
// the email is a best-effort notice). In test MailService is stubbed and
// never throws, so this ordering is invisible there.
interface PendingEmail {
  to: string;
  kind: 'IMAGE_REJECTED' | 'STRIKE_ISSUED' | 'ACCOUNT_BANNED';
  reason: string;
}

@Injectable()
export class ModerationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly verificationService: VerificationService,
  ) {}

  // BL-027 / §14: the Global Flag Queue. Every PENDING asset (a fresh
  // upload, or a published one a community report flipped back), oldest
  // first, each carrying whatever reports point at it. One row per asset --
  // a never-reported pending upload has an empty `reports` array.
  async getFlagQueue(): Promise<FlagQueueItem[]> {
    const assets = await this.dataSource.getRepository(MediaAsset).find({
      where: { moderationStatus: MediaModerationStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    if (assets.length === 0) {
      return [];
    }

    const reports = await this.dataSource.getRepository(MediaReport).find({
      where: { mediaAssetId: In(assets.map((a) => a.id)) },
      order: { createdAt: 'ASC' },
    });
    const reportsByAsset = new Map<string, FlagQueueReport[]>();
    for (const r of reports) {
      const list = reportsByAsset.get(r.mediaAssetId) ?? [];
      list.push({
        id: r.id,
        reportedBy: r.reportedBy,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      });
      reportsByAsset.set(r.mediaAssetId, list);
    }

    return assets.map((a) => ({
      mediaAssetId: a.id,
      ownerUserId: a.ownerUserId,
      purpose: a.purpose,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
      moderationStatus: a.moderationStatus,
      createdAt: a.createdAt.toISOString(),
      reports: reportsByAsset.get(a.id) ?? [],
    }));
  }

  // BL-028. Approve / Reject / Reject+Strike / Reject+Ban on one asset.
  async moderateMediaAsset(
    adminUserId: string,
    mediaAssetId: string,
    dto: ModerateMediaDto,
  ): Promise<ModerationResult> {
    const pendingEmails: PendingEmail[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      const assetRepo = manager.getRepository(MediaAsset);
      const asset = await assetRepo.findOne({ where: { id: mediaAssetId } });
      if (!asset) {
        throw new NotFoundException(`Media asset "${mediaAssetId}" not found`);
      }
      if (asset.moderationStatus !== MediaModerationStatus.PENDING) {
        throw new ConflictException(
          'This asset has already been moderated and is not awaiting a decision',
        );
      }

      const isVerificationPhoto = VERIFICATION_PURPOSES.includes(asset.purpose);

      if (dto.decision === ModerationDecision.APPROVE) {
        return this.approve(manager, asset, adminUserId);
      }

      return this.reject(
        manager,
        asset,
        adminUserId,
        dto,
        isVerificationPhoto,
        pendingEmails,
      );
    });

    for (const email of pendingEmails) {
      await this.mail.sendModerationEmail(email.to, email.kind, email.reason);
    }

    return result;
  }

  // BL-030. A community report on a published (APPROVED) asset re-enters the
  // Flag Queue (§10.3).
  async reportAsset(
    reporterUserId: string,
    mediaAssetId: string,
    dto: ReportMediaDto,
  ): Promise<{
    mediaAssetId: string;
    moderationStatus: MediaModerationStatus;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const assetRepo = manager.getRepository(MediaAsset);
      const asset = await assetRepo.findOne({ where: { id: mediaAssetId } });
      if (!asset) {
        throw new NotFoundException(`Media asset "${mediaAssetId}" not found`);
      }
      if (asset.moderationStatus !== MediaModerationStatus.APPROVED) {
        // A pending asset is already in the queue; a rejected one is gone.
        // Only a published asset can be "reported back".
        throw new ConflictException('Only a published photo can be reported');
      }

      await manager.getRepository(MediaReport).save(
        manager.getRepository(MediaReport).create({
          mediaAssetId,
          reportedBy: reporterUserId,
          reason: dto.reason?.trim() || null,
        }),
      );

      asset.moderationStatus = MediaModerationStatus.PENDING;
      await assetRepo.save(asset);

      return {
        mediaAssetId,
        moderationStatus: asset.moderationStatus,
      };
    });
  }

  private async approve(
    manager: EntityManager,
    asset: MediaAsset,
    adminUserId: string,
  ): Promise<ModerationResult> {
    asset.moderationStatus = MediaModerationStatus.APPROVED;
    await manager.getRepository(MediaAsset).save(asset);

    await this.recordModerationAction(
      manager,
      asset.id,
      adminUserId,
      ModerationDecision.APPROVE,
      null,
      null,
    );

    return {
      decision: ModerationDecision.APPROVE,
      assetStatus: MediaModerationStatus.APPROVED,
      verificationVoided: false,
      routeReverted: false,
      cragReverted: false,
      gymReverted: false,
      strikeIssued: false,
      newStrikeCount: null,
      userBanned: false,
    };
  }

  private async reject(
    manager: EntityManager,
    asset: MediaAsset,
    adminUserId: string,
    dto: ModerateMediaDto,
    isVerificationPhoto: boolean,
    pendingEmails: PendingEmail[],
  ): Promise<ModerationResult> {
    const willStrike =
      isVerificationPhoto ||
      dto.pairedAction === AccountabilityAction.ISSUE_STRIKE;
    const willBan = dto.pairedAction === AccountabilityAction.BAN_OUTRIGHT;
    const reasonRequired = willStrike || willBan;

    const reasonText = dto.reasonText?.trim() || null;
    const reasonPreset = dto.reasonPreset ?? null;

    // AR-42: a bare Reject of an ordinary asset with no paired strike/ban
    // may omit a reason (Foundation §10.2 names none); every other reject --
    // verification photo (AR-1), or paired with strike/ban (§11) -- must
    // carry one. OTHER always needs freehand text (§11).
    if (reasonRequired && !reasonText && !reasonPreset) {
      throw new BadRequestException(
        'A reason (preset or written text) is required to reject this photo',
      );
    }
    if (reasonPreset === ModerationReasonPreset.OTHER && !reasonText) {
      throw new BadRequestException(
        'The "Other" reason preset requires written text',
      );
    }

    const resolvedReason =
      reasonText ??
      (reasonPreset ? MODERATION_REASON_PRESET_LABELS[reasonPreset] : null);

    asset.moderationStatus = MediaModerationStatus.REJECTED;
    await manager.getRepository(MediaAsset).save(asset);

    const moderationAction = await this.recordModerationAction(
      manager,
      asset.id,
      adminUserId,
      ModerationDecision.REJECT,
      reasonPreset,
      reasonText,
    );

    // Void the verification this photo backed, so a rejected photo stops
    // counting toward the 4-verifier gate (BL-029 for routes, AR-47 for
    // gyms).
    let verificationVoided = false;
    let routeReverted = false;
    let cragReverted = false;
    let gymReverted = false;
    if (asset.purpose === MediaPurpose.ROUTE_VERIFICATION_PHOTO) {
      const voidResult =
        await this.verificationService.voidRouteVerificationByPhoto(
          manager,
          asset.id,
        );
      verificationVoided = voidResult.voided;
      routeReverted = voidResult.routeReverted;
      cragReverted = voidResult.cragReverted;
    } else if (asset.purpose === MediaPurpose.GYM_VERIFICATION_PHOTO) {
      const voidResult =
        await this.verificationService.voidGymVerificationByPhoto(
          manager,
          asset.id,
        );
      verificationVoided = voidResult.voided;
      gymReverted = voidResult.gymReverted;
    }

    // Accountability side effects. `resolvedReason` is guaranteed non-null
    // here whenever willStrike/willBan (reasonRequired branch above).
    let strikeIssued = false;
    let newStrikeCount: number | null = null;
    let userBanned = false;

    const userRepo = manager.getRepository(User);
    const owner = await userRepo.findOne({ where: { id: asset.ownerUserId } });

    if ((willStrike || willBan) && owner) {
      if (willStrike) {
        owner.strikeCount += 1;
        strikeIssued = true;
        newStrikeCount = owner.strikeCount;

        const strikeAction = await this.recordAccountabilityAction(
          manager,
          owner.id,
          adminUserId,
          AccountabilityAction.ISSUE_STRIKE,
          reasonPreset,
          resolvedReason as string,
          moderationAction.id,
        );

        pendingEmails.push({
          to: owner.email,
          kind: 'STRIKE_ISSUED',
          reason: resolvedReason as string,
        });
        // AR-6: a STRIKE_ISSUED notification's related_entity_id points at the
        // user_accountability_actions row, not the media action.
        await this.notifications.createNotification(
          manager,
          owner.id,
          NotificationType.STRIKE_ISSUED,
          strikeAction.id,
        );

        if (owner.strikeCount >= STRIKE_BAN_THRESHOLD && !owner.isBanned) {
          // Auto-ban: a side effect of the 3rd strike, "without a separate
          // admin action" (TestInventory) -- no BAN_OUTRIGHT accountability
          // row, and no in-app notification (§12), only the email.
          owner.isBanned = true;
          owner.bannedAt = new Date();
          userBanned = true;
          pendingEmails.push({
            to: owner.email,
            kind: 'ACCOUNT_BANNED',
            reason: resolvedReason as string,
          });
        }
      }

      if (willBan && !owner.isBanned) {
        owner.isBanned = true;
        owner.bannedAt = new Date();
        userBanned = true;

        await this.recordAccountabilityAction(
          manager,
          owner.id,
          adminUserId,
          AccountabilityAction.BAN_OUTRIGHT,
          reasonPreset,
          resolvedReason as string,
          moderationAction.id,
        );

        pendingEmails.push({
          to: owner.email,
          kind: 'ACCOUNT_BANNED',
          reason: resolvedReason as string,
        });
      }

      await userRepo.save(owner);
    }

    // The rejection is its own §12 event ("image rejected"), separate from
    // any strike -- a verification-photo rejection raises BOTH, matching the
    // two distinct alert cards in the mockup. The IMAGE_REJECTED email
    // carries the reason if one was recorded, or a generic notice if the
    // admin rejected a bare ordinary asset without one.
    if (owner) {
      await this.notifications.createNotification(
        manager,
        owner.id,
        NotificationType.IMAGE_REJECTED,
        moderationAction.id,
      );
      pendingEmails.push({
        to: owner.email,
        kind: 'IMAGE_REJECTED',
        reason: resolvedReason ?? 'No specific reason was recorded.',
      });
    }

    return {
      decision: ModerationDecision.REJECT,
      assetStatus: MediaModerationStatus.REJECTED,
      verificationVoided,
      routeReverted,
      cragReverted,
      gymReverted,
      strikeIssued,
      newStrikeCount,
      userBanned,
    };
  }

  private async recordModerationAction(
    manager: EntityManager,
    mediaAssetId: string,
    adminUserId: string,
    decision: ModerationDecision,
    reasonPreset: ModerationReasonPreset | null,
    reasonText: string | null,
  ): Promise<MediaModerationAction> {
    const repo = manager.getRepository(MediaModerationAction);
    return repo.save(
      repo.create({
        mediaAssetId,
        adminUserId,
        decision,
        reasonPreset,
        reasonText,
      }),
    );
  }

  private async recordAccountabilityAction(
    manager: EntityManager,
    targetUserId: string,
    adminUserId: string,
    actionType: AccountabilityAction,
    reasonPreset: ModerationReasonPreset | null,
    reasonText: string,
    triggeringMediaActionId: string,
  ): Promise<UserAccountabilityAction> {
    const repo = manager.getRepository(UserAccountabilityAction);
    return repo.save(
      repo.create({
        targetUserId,
        adminUserId,
        actionType,
        reasonPreset,
        reasonText,
        triggeringMediaActionId,
      }),
    );
  }
}
