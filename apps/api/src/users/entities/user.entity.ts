import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  VERIFIED_USER = 'VERIFIED_USER',
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
}

export enum GradeDisplayPref {
  YOSEMITE = 'YOSEMITE',
  FRENCH = 'FRENCH',
}

// Architecture.md §2. Columns beyond what BL-001-005 (Epic 1: Auth & Session
// Core) touch are still included here since this is the first `users`
// migration and Architecture is schema source of truth -- cheaper to create
// them once than to bolt them on piecemeal across Epic 1's four other stories.
//
// NOT included yet: `profile_photo_media_id` (FK -> media_assets.id).
// media_assets doesn't exist until BL-008; added via its own ALTER TABLE
// migration when the media gateway ships rather than forward-declared now.
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // citext: case-insensitive lookups/uniqueness by construction (Architecture §2).
  @Column({ type: 'citext', unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ name: 'display_name', type: 'varchar', length: 50 })
  displayName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.VERIFIED_USER,
  })
  role: UserRole;

  @Column({ type: 'varchar', length: 250, nullable: true })
  bio: string | null;

  @Column({
    name: 'grade_display_pref',
    type: 'enum',
    enum: GradeDisplayPref,
    enumName: 'grade_display_pref',
    default: GradeDisplayPref.YOSEMITE,
  })
  gradeDisplayPref: GradeDisplayPref;

  @Column({ name: 'is_private', type: 'boolean', default: false })
  isPrivate: boolean;

  @Column({ name: 'strike_count', type: 'smallint', default: 0 })
  strikeCount: number;

  @Column({ name: 'is_banned', type: 'boolean', default: false })
  isBanned: boolean;

  @Column({ name: 'banned_at', type: 'timestamptz', nullable: true })
  bannedAt: Date | null;

  // citext for the same case-insensitive reason as `email` (§15 two-step email change).
  @Column({ name: 'pending_email', type: 'citext', nullable: true })
  pendingEmail: string | null;

  // BL-002 / Architecture.md AR-10: one active login session per user,
  // stored directly on `users` rather than a separate sessions table (see
  // AR-10 for why). `refreshTokenHash` is a SHA-256 hash of the opaque
  // random value handed to the browser in the session cookie -- the raw
  // value is never persisted, only ever compared by re-hashing.
  @Column({ name: 'refresh_token_hash', type: 'text', nullable: true })
  refreshTokenHash: string | null;

  @Column({
    name: 'refresh_token_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  refreshTokenExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
