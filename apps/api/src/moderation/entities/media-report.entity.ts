import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Architecture.md §6 `media_reports`. BL-030: a community report on a
// published asset. Inserting a row here flips the target
// media_assets.moderation_status back to PENDING (done in ModerationService,
// not a trigger, so Cucumber sees it), re-entering the Flag Queue (§10.3).
@Entity('media_reports')
export class MediaReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'media_asset_id', type: 'uuid' })
  mediaAssetId: string;

  @Column({ name: 'reported_by', type: 'uuid' })
  reportedBy: string;

  // Nullable -- a community report is not the mandatory-reason mechanism
  // (that is §11, admin-only). 250-char ceiling matches every other piece
  // of user-authored text (Foundation §12).
  @Column({ type: 'varchar', length: 250, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
