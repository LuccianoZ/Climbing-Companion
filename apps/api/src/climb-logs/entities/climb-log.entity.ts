import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ClimbOutcome {
  COMPLETED = 'COMPLETED',
  ATTEMPTED = 'ATTEMPTED',
}

// Architecture.md §5 `climb_logs`. BL-017/BL-018: no uniqueness constraint
// -- repeats across visits are expected (§7), so this entity has no
// composite PK/unique index the way route_grade_votes does. grade_snapshot_ordinal
// is written once at insert and never updated afterwards (no
// @UpdateDateColumn / updated_at column at all -- a log is immutable
// history, not a row a later grade-consensus change should ever touch).
@Index(['userId', 'outcome'])
@Entity('climb_logs')
export class ClimbLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'route_id', type: 'uuid' })
  routeId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ClimbOutcome,
    enumName: 'climb_outcome',
  })
  outcome: ClimbOutcome;

  // Consensus (or Proposed Grade, if fewer than 4 votes existed yet) at
  // the moment this log was written -- Foundation §7's "a later grade
  // change never rewrites history."
  @Column({ name: 'grade_snapshot_ordinal', type: 'smallint' })
  gradeSnapshotOrdinal: number;

  @CreateDateColumn({ name: 'logged_at', type: 'timestamptz' })
  loggedAt: Date;
}
