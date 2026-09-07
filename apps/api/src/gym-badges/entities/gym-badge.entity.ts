import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Architecture.md §5 `gym_badges`, AR-53 (Sept 7, 2026) -- replaces the
// never-built `gym_grade_tiers` (AR-39). One permanent row per user+gym,
// minted by GymCheckinsService on a user's first check-in at a gym.
//
// `gymId` is nullable (ON DELETE SET NULL, see the migration) so a badge
// survives its gym being hard-deleted -- `gymNameSnapshot` /
// `gymInitialsSnapshot` are computed once at mint time and never
// re-derived, which is what makes the badge permanent in the sense
// Foundation §8 means.
@Index('UQ_gym_badges_user_id_gym_id', ['userId', 'gymId'], {
  unique: true,
  where: '"gym_id" IS NOT NULL',
})
@Entity('gym_badges')
export class GymBadge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'gym_id', type: 'uuid', nullable: true })
  gymId: string | null;

  @Column({ name: 'gym_name_snapshot', type: 'varchar', length: 120 })
  gymNameSnapshot: string;

  @Column({ name: 'gym_initials_snapshot', type: 'varchar', length: 8 })
  gymInitialsSnapshot: string;

  @CreateDateColumn({ name: 'earned_at', type: 'timestamptz' })
  earnedAt: Date;
}
