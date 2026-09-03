import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ModerationDecision,
  ModerationReasonPreset,
  MODERATION_REASON_MAX_LENGTH,
} from '../entities/media-moderation-action.entity';
import { AccountabilityAction } from '../entities/user-accountability-action.entity';

// The subset of AccountabilityAction an admin can pair with a Reject on a
// media asset (Foundation §10.2: "Reject paired with Issue Strike / Ban
// Outright"). REVOKE_STRIKE / RESTORE_ACCOUNT are Admin-Dashboard actions
// (Epic 7), not photo-moderation ones.
export const PAIRABLE_ACCOUNTABILITY_ACTIONS = [
  AccountabilityAction.ISSUE_STRIKE,
  AccountabilityAction.BAN_OUTRIGHT,
] as const;

// BL-028. POST /api/admin/media/:id/moderate.
//
// The "reason required" branch is enforced in ModerationService, not here,
// because it depends on the asset's `purpose` (a verification photo always
// requires one, per AR-1) which the DTO can't see. The DTO only bounds the
// shapes: a valid decision, an optional valid preset, freehand text within
// the 500-char admin ceiling, and an optional pairable action.
export class ModerateMediaDto {
  @IsEnum(ModerationDecision)
  decision: ModerationDecision;

  @IsOptional()
  @IsEnum(ModerationReasonPreset)
  reasonPreset?: ModerationReasonPreset;

  @IsOptional()
  @IsString()
  @MaxLength(MODERATION_REASON_MAX_LENGTH)
  reasonText?: string;

  @IsOptional()
  @IsIn(PAIRABLE_ACCOUNTABILITY_ACTIONS as readonly AccountabilityAction[])
  pairedAction?: AccountabilityAction;
}
