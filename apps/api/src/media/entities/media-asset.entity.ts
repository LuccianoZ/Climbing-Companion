import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MediaPurpose {
  PROFILE_PHOTO = 'PROFILE_PHOTO',
  ROUTE_VERIFICATION_PHOTO = 'ROUTE_VERIFICATION_PHOTO',
  GYM_VERIFICATION_PHOTO = 'GYM_VERIFICATION_PHOTO',
  REVIEW_PHOTO = 'REVIEW_PHOTO',
}

export enum MediaModerationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// Foundation §19.1 / Architecture §6: the MIME allowlist and per-image byte
// cap are gateway-level constants, not something each future caller
// (BL-009/011/045) re-derives -- shared by the migration's CHECK constraint,
// the multer gateway options (media-upload.options.ts), and any
// Vitest/Cucumber assertion that needs the boundary value.
export const ALLOWED_MEDIA_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
];
// Raised from 2MB to 5MB by product decision (Sept 2 2026). The DB CHECK
// constraint follows via migration 1787790000000-WidenMediaByteSizeCap.
// Foundation §19.1 / §21 risk 3 & 5 still apply: BYTEA growth and home
// upload bandwidth are the tradeoff being spent here.
export const MAX_MEDIA_BYTES = 5_242_880; // 5MB

// Architecture.md §6 `media_assets`. BL-008: the binary media gateway every
// photo in the app goes through -- never joined into map/route/search reads,
// always fetched through its own streaming endpoint (MediaController).
@Entity('media_assets')
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  // AR-15: who supplies `purpose` is the calling endpoint's job, not this
  // generic gateway's -- BL-008 only validates it's a real MediaPurpose value.
  @Column({ type: 'enum', enum: MediaPurpose, enumName: 'media_purpose' })
  purpose: MediaPurpose;

  // node-postgres returns bytea columns as Buffer natively; no transformer needed.
  @Column({ type: 'bytea' })
  payload: Buffer;

  @Column({ name: 'mime_type', type: 'varchar', length: 20 })
  mimeType: string;

  @Column({ name: 'byte_size', type: 'integer' })
  byteSize: number;

  @Column({
    name: 'moderation_status',
    type: 'enum',
    enum: MediaModerationStatus,
    enumName: 'media_moderation_status',
    default: MediaModerationStatus.PENDING,
  })
  moderationStatus: MediaModerationStatus;

  // Hash of `payload`, computed at insert (Architecture §6) -- doubles as
  // the HTTP ETag value on the streaming endpoint.
  @Column({ type: 'text' })
  etag: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
