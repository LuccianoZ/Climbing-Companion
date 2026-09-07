import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum FriendshipStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
}

// Architecture.md §7 `friendships`. Pulled forward from Epic 9 into Epic 8
// (AR-53, Sept 7, 2026, BL-x11) -- schema unchanged from its original
// design, only the build timing moves. UNIQUE (requester_id, addressee_id)
// at the DB level catches one direction of a duplicate pair; the mirrored
// pair `(addressee_id, requester_id)` is a service-layer check
// (Architecture AR-5), since Postgres has no clean declarative "unique
// unordered pair" across two directional FK columns.
@Index('IDX_friendships_addressee_status', ['addresseeId', 'status'])
@Index('IDX_friendships_requester_id', ['requesterId'])
@Entity('friendships')
export class Friendship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @Column({ name: 'addressee_id', type: 'uuid' })
  addresseeId: string;

  @Column({
    type: 'enum',
    enum: FriendshipStatus,
    enumName: 'friendship_status',
    default: FriendshipStatus.PENDING,
  })
  status: FriendshipStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;
}
