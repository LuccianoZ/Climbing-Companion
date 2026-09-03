import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Architecture.md §4 `gym_information_disputes`. Foundation Revision
// Sept 3 2026 (AR-51, BL-x06): when a verifier within 300m answers "No, the
// submission information is inaccurate", the free-text "what is inaccurate?"
// answer is recorded here instead of a gym_verifications row -- it does not
// count toward the 4-verifier gate. An admin reviews the queue (Foundation
// §14) and either applies a correction (adminUpdateGym, BL-x07) or dismisses
// it; either way `resolved_at` is stamped. No UNIQUE constraint -- a gym can
// carry several open disputes from different verifiers.
//
// The partial index on unresolved rows (the admin queue's only scan) lives
// in migration RelaxGymVerificationAddDisputes, not as a decorator here --
// synchronize is permanently false.
@Entity('gym_information_disputes')
export class GymInformationDispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'gym_id', type: 'uuid' })
  gymId: string;

  @Column({ name: 'reporter_user_id', type: 'uuid' })
  reporterUserId: string;

  @Column({ type: 'varchar', length: 500 })
  detail: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
