import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Architecture.md §5 `gym_checkins`. BL-024. No uniqueness constraint --
// repeated check-ins across different visits are expected, mirroring
// climb_logs' "repeats expected" convention (AR-18) rather than
// route_grade_votes' upsert-on-composite-PK shape, so this has a plain
// generated uuid PK, not a composite one.
//
// AR-39: BL-025 (a self-recorded per-facility grade tier, originally
// scoped alongside this table as a sibling `gym_grade_tiers`) was cut from
// Sprint 3 scope before implementation began. This entity is Epic 5's only
// one -- there is no GymGradeTier anywhere in this codebase.
@Index(['userId', 'gymId'])
@Entity('gym_checkins')
export class GymCheckin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'gym_id', type: 'uuid' })
  gymId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @CreateDateColumn({ name: 'checked_in_at', type: 'timestamptz' })
  checkedInAt: Date;
}
