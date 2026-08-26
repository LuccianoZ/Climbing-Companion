import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { LifecycleStatus } from '../../common/enums/lifecycle-status.enum';
import type { GeoJsonPoint } from '../../crags/entities/crag.entity';

export enum OutdoorDiscipline {
  SPORT_CLIMBING = 'SPORT_CLIMBING',
  BOULDERING = 'BOULDERING',
  TRADITIONAL_CLIMBING = 'TRADITIONAL_CLIMBING',
}

export enum GearRequirement {
  QUICKDRAWS = 'QUICKDRAWS',
  CRASH_PAD = 'CRASH_PAD',
  TRAD_GEAR = 'TRAD_GEAR',
  HELMET = 'HELMET',
}

// Architecture.md §3 `routes`. BL-006. The CHECK constraint forbidding
// bolt_count/min_rope_length_m for BOULDERING lives in the migration (a
// boolean SQL expression, not expressible as TypeORM column options) and is
// mirrored in SubmitRouteDto's cross-field validator.
@Entity('routes')
export class Route {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'crag_id', type: 'uuid' })
  cragId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // See the comment on Crag.location (crag.entity.ts) -- same GeoJSON
  // auto-conversion, same "GiST index lives in the migration, not here"
  // reasoning.
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: GeoJsonPoint;

  @Column({
    type: 'enum',
    enum: OutdoorDiscipline,
    enumName: 'outdoor_discipline',
  })
  discipline: OutdoorDiscipline;

  @Column({
    name: 'gear_requirements',
    type: 'enum',
    enum: GearRequirement,
    enumName: 'gear_requirement',
    array: true,
    default: '{}',
  })
  gearRequirements: GearRequirement[];

  @Column({ type: 'varchar', length: 250 })
  summary: string;

  // Submitter's own estimate, display-only until 4 grade votes exist
  // (Architecture §3/§6) -- never counted in route_grade_votes.
  @Column({ name: 'proposed_grade_ordinal', type: 'smallint' })
  proposedGradeOrdinal: number;

  @Column({ name: 'bolt_count', type: 'smallint', nullable: true })
  boltCount: number | null;

  @Column({ name: 'min_rope_length_m', type: 'smallint', nullable: true })
  minRopeLengthM: number | null;

  @Column({
    type: 'enum',
    enum: LifecycleStatus,
    enumName: 'lifecycle_status',
    default: LifecycleStatus.UNVERIFIED,
  })
  status: LifecycleStatus;

  @Column({ name: 'submitted_by', type: 'uuid' })
  submittedBy: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
