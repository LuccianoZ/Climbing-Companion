import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationType {
  FRIEND_REQUEST_RECEIVED = 'FRIEND_REQUEST_RECEIVED',
  IMAGE_REJECTED = 'IMAGE_REJECTED',
  STRIKE_ISSUED = 'STRIKE_ISSUED',
}

// Architecture.md §7 `notifications`. Pulled forward into Epic 6 for
// BL-028's in-app alerts (AR-43). No `read_at` column -- "unread" is
// client-side state keyed on last_checked_timestamp (§19.2), not a server
// flag. `relatedEntityId` is a loose UUID with no FK (AR-6): for
// IMAGE_REJECTED it is the media_moderation_actions row, for STRIKE_ISSUED
// the user_accountability_actions row.
@Index('IDX_notifications_recipient_created', ['recipientUserId', 'createdAt'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'recipient_user_id', type: 'uuid' })
  recipientUserId: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type',
  })
  type: NotificationType;

  @Column({ name: 'related_entity_id', type: 'uuid', nullable: true })
  relatedEntityId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
