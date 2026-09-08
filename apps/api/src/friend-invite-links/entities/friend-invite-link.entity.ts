import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Architecture.md §7 `friend_invite_links`, AR-55 (Sept 7 2026 -- Part 2).
// The single mechanism for creating a friendship: a climber mints a link
// (create), sends it out-of-band, and the first valid redemption (redeem)
// makes the two friends. Single-use (consumed_at set on redemption) and
// 7-day expiry (expires_at, set by the service).
@Index('IDX_friend_invite_links_creator_id', ['creatorId'])
@Entity('friend_invite_links')
export class FriendInviteLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The only secret in the shareable URL. base64url of 32 random bytes ->
  // 43 chars, comfortably inside varchar(64). UNIQUE at the DB level.
  @Column({ type: 'varchar', length: 64, unique: true })
  token: string;

  @Column({ name: 'creator_id', type: 'uuid' })
  creatorId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ name: 'consumed_by_id', type: 'uuid', nullable: true })
  consumedById: string | null;
}
