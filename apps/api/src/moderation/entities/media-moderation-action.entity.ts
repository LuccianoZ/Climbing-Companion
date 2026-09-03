import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ModerationDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

// Foundation §11's fixed preset list -- not admin-authored. `OTHER` requires
// free text (Foundation §11); ModerationService enforces that.
export enum ModerationReasonPreset {
  OFF_TOPIC = 'OFF_TOPIC',
  LOW_IMAGE_QUALITY = 'LOW_IMAGE_QUALITY',
  INAPPROPRIATE_EXPLICIT = 'INAPPROPRIATE_EXPLICIT',
  SUSPECTED_FRAUDULENT = 'SUSPECTED_FRAUDULENT',
  OTHER = 'OTHER',
}

// The 500-char ceiling is an admin record, not user content (Foundation
// §10/§11) -- distinct from the 250-char ceiling on everything a climber
// types.
export const MODERATION_REASON_MAX_LENGTH = 500;

// Foundation §11's preset wording, verbatim. Used to fill in the
// email/notification reason text when an admin picked a preset but typed no
// freehand text (a preset alone is a valid reason for everything except
// OTHER, which requires text).
export const MODERATION_REASON_PRESET_LABELS: Record<
  ModerationReasonPreset,
  string
> = {
  [ModerationReasonPreset.OFF_TOPIC]: 'Off-topic content',
  [ModerationReasonPreset.LOW_IMAGE_QUALITY]: 'Low image quality',
  [ModerationReasonPreset.INAPPROPRIATE_EXPLICIT]:
    'Inappropriate/explicit content',
  [ModerationReasonPreset.SUSPECTED_FRAUDULENT]:
    'Suspected fraudulent submission',
  [ModerationReasonPreset.OTHER]: 'Other',
};

// Architecture.md §6 `media_moderation_actions`. BL-028: one row per admin
// Approve / Reject decision on a media asset. When a Reject also strikes or
// bans, a `user_accountability_actions` row is written in the same
// transaction and points back here via `triggering_media_action_id`.
@Entity('media_moderation_actions')
export class MediaModerationAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'media_asset_id', type: 'uuid' })
  mediaAssetId: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  @Column({
    type: 'enum',
    enum: ModerationDecision,
    enumName: 'moderation_decision',
  })
  decision: ModerationDecision;

  // Both nullable at the DB level -- Approve carries no reason, and a bare
  // Reject of an ordinary asset with no paired strike/ban does not require
  // one (AR-42). The service enforces the mandatory branch.
  @Column({
    name: 'reason_preset',
    type: 'enum',
    enum: ModerationReasonPreset,
    enumName: 'moderation_reason_preset',
    nullable: true,
  })
  reasonPreset: ModerationReasonPreset | null;

  @Column({
    name: 'reason_text',
    type: 'varchar',
    length: MODERATION_REASON_MAX_LENGTH,
    nullable: true,
  })
  reasonText: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
