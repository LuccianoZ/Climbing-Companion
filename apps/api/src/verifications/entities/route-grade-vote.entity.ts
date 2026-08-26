import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// Architecture.md §4 `route_grade_votes`. BL-009 / AR-4: one table serving
// both the verification flow's grade vote (this story) and the standalone
// "Vote on Grade" action (Sprint 2, BL-015) -- both converge on the same
// upsert target, PK (route_id, voter_user_id), which is why this entity
// declares a composite primary key via two @PrimaryColumn()s rather than a
// generated id. VerificationService writes to this table with a raw
// ON CONFLICT upsert (query builder, not repository.save()) so a climber
// changing their vote on a return visit replaces the row instead of
// colliding with the PK.
@Entity('route_grade_votes')
export class RouteGradeVote {
  @Index()
  @PrimaryColumn({ name: 'route_id', type: 'uuid' })
  routeId: string;

  @PrimaryColumn({ name: 'voter_user_id', type: 'uuid' })
  voterUserId: string;

  @Column({ name: 'grade_ordinal', type: 'smallint' })
  gradeOrdinal: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
