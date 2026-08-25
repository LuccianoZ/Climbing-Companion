import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Architecture.md §2 `password_reset_tokens`. Lives under `auth/entities`
// rather than `users/entities` -- unlike `users`, nothing outside the
// password-reset flow (BL-004) ever touches this table.
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // SHA-256 hash of the opaque token embedded in the emailed reset link --
  // same one-way convention as `users.refresh_token_hash` (AR-10): the raw
  // value is never persisted, only ever compared by re-hashing.
  @Column({ name: 'token_hash', type: 'text', unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  // Single-use enforcement: set on redemption; a second redemption attempt
  // is rejected (BL-004 acceptance criterion 2).
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
