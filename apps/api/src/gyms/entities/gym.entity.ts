import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LifecycleStatus } from '../../common/enums/lifecycle-status.enum';
import type { GeoJsonPoint } from '../../crags/entities/crag.entity';

export enum GymDiscipline {
  AUTO_BELAY = 'AUTO_BELAY',
  TOP_ROPE = 'TOP_ROPE',
  LEAD = 'LEAD',
  BOULDERING = 'BOULDERING',
  SPEED_CLIMBING = 'SPEED_CLIMBING',
}

// Architecture.md §3 `gyms`. BL-007: unlike crags, a gym is a standalone
// pin -- Foundation §4 ("no child routes, its own independent verification
// pipeline") -- so there is deliberately no crag_id/founding-route concept
// anywhere on this entity.
@Entity('gyms')
export class Gym {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // See the comment on Crag.location (crag.entity.ts) -- same GeoJSON
  // auto-conversion; GiST index lives in the migration, not here.
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: GeoJsonPoint;

  @Column({
    type: 'enum',
    enum: LifecycleStatus,
    enumName: 'lifecycle_status',
    default: LifecycleStatus.UNVERIFIED,
  })
  status: LifecycleStatus;

  // Architecture §3/§4: empty at submission time -- populated as the union
  // of all four verifiers' disciplines_submitted arrays once BL-011's 4th
  // gym verification lands (gym_verifications.disciplines_submitted), not
  // collected on the submission form itself.
  @Column({
    name: 'disciplines_offered',
    type: 'enum',
    enum: GymDiscipline,
    enumName: 'gym_discipline',
    array: true,
    default: '{}',
  })
  disciplinesOffered: GymDiscipline[];

  @Column({ name: 'submitted_by', type: 'uuid' })
  submittedBy: string;

  // BL-012 (admin direct verification, bypassing the 4-verifier gate) sets
  // this true; BL-007 always inserts false.
  @Column({
    name: 'verified_directly_by_admin',
    type: 'boolean',
    default: false,
  })
  verifiedDirectlyByAdmin: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
