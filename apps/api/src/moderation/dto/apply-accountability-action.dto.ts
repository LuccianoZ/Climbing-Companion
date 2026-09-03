import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ModerationReasonPreset,
  MODERATION_REASON_MAX_LENGTH,
} from '../entities/media-moderation-action.entity';
import { AccountabilityAction } from '../entities/user-accountability-action.entity';

// BL-033 / Foundation §11 / §14: the User Account Audit view's four
// standalone actions -- Issue Strike, Revoke Strike, Ban Outright, Restore
// Account. Unlike ModerateMediaDto's `pairedAction` (which is only ever
// ISSUE_STRIKE / BAN_OUTRIGHT, hung off a photo rejection), all four values
// are valid here.
//
// Every §11 action "requires a mandatory reason -- chosen from a preset
// (which pre-fills an editable field), typed freehand, or both -- capped at
// 500 characters". The DTO only bounds the shapes; AccountabilityService
// enforces the "at least one of preset/text, and OTHER needs freehand text"
// rule, exactly as ModerationService.reject does for photo rejections.
export class ApplyAccountabilityActionDto {
  @IsEnum(AccountabilityAction)
  action: AccountabilityAction;

  @IsOptional()
  @IsEnum(ModerationReasonPreset)
  reasonPreset?: ModerationReasonPreset;

  @IsOptional()
  @IsString()
  @MaxLength(MODERATION_REASON_MAX_LENGTH)
  reasonText?: string;
}
