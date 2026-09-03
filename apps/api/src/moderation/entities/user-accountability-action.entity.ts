import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import {
  ModerationReasonPreset,
  MODERATION_REASON_MAX_LENGTH,
} from './media-moderation-action.entity';

export enum AccountabilityAction {
  ISSUE_STRIKE = 'ISSUE_STRIKE',
  REVOKE_STRIKE = 'REVOKE_STRIKE',
  BAN_OUTRIGHT = 'BAN_OUTRIGHT',
  RESTORE_ACCOUNT = 'RESTORE_ACCOUNT',
}

// Architecture.md §6 `user_accountability_actions`. Every insert here also
// fires the mandatory reason email (§11) and, in the same transaction,
// updates users.strike_count / users.is_banned. Epic 6 only ever writes
// ISSUE_STRIKE and BAN_OUTRIGHT (both as side effects of a photo rejection,
// so `triggeringMediaActionId` is always set); REVOKE_STRIKE /
// RESTORE_ACCOUNT and the standalone admin-dashboard path are Epic 7.
@Index('IDX_user_accountability_actions_target_created', [
  'targetUserId',
  'createdAt',
])
@Entity('user_accountability_actions')
export class UserAccountabilityAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'target_user_id', type: 'uuid' })
  targetUserId: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  @Column({
    name: 'action_type',
    type: 'enum',
    enum: AccountabilityAction,
    enumName: 'accountability_action',
  })
  actionType: AccountabilityAction;

  @Column({
    name: 'reason_preset',
    type: 'enum',
    enum: ModerationReasonPreset,
    enumName: 'moderation_reason_preset',
    nullable: true,
  })
  reasonPreset: ModerationReasonPreset | null;

  // NOT NULL -- mandatory for all four actions (Foundation §11).
  @Column({
    name: 'reason_text',
    type: 'varchar',
    length: MODERATION_REASON_MAX_LENGTH,
  })
  reasonText: string;

  @Column({ name: 'triggering_media_action_id', type: 'uuid', nullable: true })
  triggeringMediaActionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
