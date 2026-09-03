import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { MailService, ModerationEmailKind } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import {
  ModerationReasonPreset,
  MODERATION_REASON_PRESET_LABELS,
} from './entities/media-moderation-action.entity';
import {
  AccountabilityAction,
  UserAccountabilityAction,
} from './entities/user-accountability-action.entity';
import { ApplyAccountabilityActionDto } from './dto/apply-accountability-action.dto';

// Foundation §11: auto-ban on the third cumulative strike -- the same
// threshold ModerationService's photo-rejection path uses, kept as its own
// local constant here for the same reason (they are conceptually the same
// rule reached from two entry points, not one shared piece of state).
const STRIKE_BAN_THRESHOLD = 3;

export interface AccountabilityResult {
  action: AccountabilityAction;
  targetUserId: string;
  strikeCount: number;
  isBanned: boolean;
  // true only for an ISSUE_STRIKE that itself tripped the 3rd-strike
  // auto-ban (Foundation §11) -- no separate BAN_OUTRIGHT row is written,
  // and §12 says the ban produces no in-app notification, only the email.
  autoBanned: boolean;
}

export interface UserAuditEntry {
  id: string;
  actionType: AccountabilityAction;
  adminUserId: string;
  reasonPreset: ModerationReasonPreset | null;
  reasonText: string;
  triggeringMediaActionId: string | null;
  createdAt: string;
}

export interface UserAuditView {
  userId: string;
  strikeCount: number;
  isBanned: boolean;
  bannedAt: string | null;
  // Newest first. Includes both the standalone actions taken here and the
  // ISSUE_STRIKE / BAN_OUTRIGHT rows ModerationService writes as a side
  // effect of a photo rejection (those carry a triggeringMediaActionId).
  history: UserAuditEntry[];
}

interface PendingEmail {
  to: string;
  kind: ModerationEmailKind;
  reason: string;
}

// BL-033 / Foundation §11 / §14: the User Account Audit view's four
// standalone accountability actions. Kept off ModerationService (which only
// ever reaches ISSUE_STRIKE / BAN_OUTRIGHT, and only hung off a photo
// rejection) so each service stays a single, independently-covered surface
// -- the same split reason MapService documents. The two services share the
// `user_accountability_actions` table, `users.strike_count` / `is_banned`,
// the §11 mandatory-reason rule, and the deferred-email pattern (collect
// during the transaction, flush only after it commits so a mail failure
// can never roll back a completed action).
@Injectable()
export class AccountabilityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  async applyAction(
    adminUserId: string,
    targetUserId: string,
    dto: ApplyAccountabilityActionDto,
  ): Promise<AccountabilityResult> {
    const resolvedReason = this.resolveReason(dto);
    const pendingEmails: PendingEmail[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const user = await userRepo.findOne({ where: { id: targetUserId } });
      if (!user) {
        throw new NotFoundException(`User "${targetUserId}" not found`);
      }

      let autoBanned = false;

      switch (dto.action) {
        case AccountabilityAction.ISSUE_STRIKE: {
          user.strikeCount += 1;
          const action = await this.recordAction(
            manager,
            user.id,
            adminUserId,
            AccountabilityAction.ISSUE_STRIKE,
            dto.reasonPreset ?? null,
            resolvedReason,
          );
          // §12: a strike is one of the three notification events.
          await this.notifications.createNotification(
            manager,
            user.id,
            NotificationType.STRIKE_ISSUED,
            action.id,
          );
          pendingEmails.push({
            to: user.email,
            kind: 'STRIKE_ISSUED',
            reason: resolvedReason,
          });

          if (user.strikeCount >= STRIKE_BAN_THRESHOLD && !user.isBanned) {
            user.isBanned = true;
            user.bannedAt = new Date();
            autoBanned = true;
            // §12: the ban itself produces no in-app notification.
            pendingEmails.push({
              to: user.email,
              kind: 'ACCOUNT_BANNED',
              reason: resolvedReason,
            });
          }
          break;
        }

        case AccountabilityAction.REVOKE_STRIKE: {
          if (user.strikeCount === 0) {
            throw new ConflictException('This user has no strikes to revoke');
          }
          user.strikeCount -= 1;
          // §11's table: Revoke Strike is "-1 strike" only. Lifting a
          // (possibly auto-applied) ban is Restore Account's job -- the
          // "unified reversal" -- not this one; dropping below the threshold
          // does not auto-unban.
          await this.recordAction(
            manager,
            user.id,
            adminUserId,
            AccountabilityAction.REVOKE_STRIKE,
            dto.reasonPreset ?? null,
            resolvedReason,
          );
          pendingEmails.push({
            to: user.email,
            kind: 'STRIKE_REVOKED',
            reason: resolvedReason,
          });
          break;
        }

        case AccountabilityAction.BAN_OUTRIGHT: {
          if (user.isBanned) {
            throw new ConflictException('This user is already banned');
          }
          user.isBanned = true;
          user.bannedAt = new Date();
          await this.recordAction(
            manager,
            user.id,
            adminUserId,
            AccountabilityAction.BAN_OUTRIGHT,
            dto.reasonPreset ?? null,
            resolvedReason,
          );
          pendingEmails.push({
            to: user.email,
            kind: 'ACCOUNT_BANNED',
            reason: resolvedReason,
          });
          break;
        }

        case AccountabilityAction.RESTORE_ACCOUNT: {
          if (!user.isBanned && user.strikeCount === 0) {
            throw new ConflictException(
              'This user is not banned and has no strikes to reset',
            );
          }
          // §11: "Unified reversal -- lifts any ban and resets strikes to zero."
          user.isBanned = false;
          user.bannedAt = null;
          user.strikeCount = 0;
          await this.recordAction(
            manager,
            user.id,
            adminUserId,
            AccountabilityAction.RESTORE_ACCOUNT,
            dto.reasonPreset ?? null,
            resolvedReason,
          );
          pendingEmails.push({
            to: user.email,
            kind: 'ACCOUNT_RESTORED',
            reason: resolvedReason,
          });
          break;
        }
      }

      await userRepo.save(user);

      return {
        action: dto.action,
        targetUserId: user.id,
        strikeCount: user.strikeCount,
        isBanned: user.isBanned,
        autoBanned,
      };
    });

    for (const email of pendingEmails) {
      await this.mail.sendModerationEmail(email.to, email.kind, email.reason);
    }

    return result;
  }

  async getUserAudit(userId: string): Promise<UserAuditView> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User "${userId}" not found`);
    }

    const actions = await this.dataSource
      .getRepository(UserAccountabilityAction)
      .find({
        where: { targetUserId: userId },
        order: { createdAt: 'DESC' },
      });

    return {
      userId: user.id,
      strikeCount: user.strikeCount,
      isBanned: user.isBanned,
      bannedAt: user.bannedAt ? user.bannedAt.toISOString() : null,
      history: actions.map((a) => ({
        id: a.id,
        actionType: a.actionType,
        adminUserId: a.adminUserId,
        reasonPreset: a.reasonPreset,
        reasonText: a.reasonText,
        triggeringMediaActionId: a.triggeringMediaActionId,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  // Same rule as ModerationService.reject (AR-42): a preset alone is a valid
  // reason for every action except OTHER, which always needs freehand text;
  // an action with neither preset nor text is rejected. The resolved string
  // is what gets stored (NOT NULL on user_accountability_actions.reason_text)
  // and emailed.
  private resolveReason(dto: ApplyAccountabilityActionDto): string {
    const reasonText = dto.reasonText?.trim() || null;
    const reasonPreset = dto.reasonPreset ?? null;

    if (!reasonText && !reasonPreset) {
      throw new BadRequestException(
        'A reason (preset or written text) is required for this action',
      );
    }
    if (reasonPreset === ModerationReasonPreset.OTHER && !reasonText) {
      throw new BadRequestException(
        'The "Other" reason preset requires written text',
      );
    }

    return (
      reasonText ??
      MODERATION_REASON_PRESET_LABELS[reasonPreset as ModerationReasonPreset]
    );
  }

  private async recordAction(
    manager: EntityManager,
    targetUserId: string,
    adminUserId: string,
    actionType: AccountabilityAction,
    reasonPreset: ModerationReasonPreset | null,
    reasonText: string,
  ): Promise<UserAccountabilityAction> {
    const repo = manager.getRepository(UserAccountabilityAction);
    return repo.save(
      repo.create({
        targetUserId,
        adminUserId,
        actionType,
        reasonPreset,
        reasonText,
        // Standalone dashboard action -- not triggered by a media decision.
        triggeringMediaActionId: null,
      }),
    );
  }
}
