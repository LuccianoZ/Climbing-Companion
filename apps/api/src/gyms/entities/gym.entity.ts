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

// Foundation Revision Sept 3 2026 (AR-51, BL-x04): a gym's weekly hours.
// One range within a day; `closes < opens` means it runs past midnight into
// the next day; `fullDay` (with 00:00/00:00) means open 24 hours.
export interface OperatingHoursRange {
  opens: string; // "HH:MM", 24-hour
  closes: string; // "HH:MM", 24-hour
  fullDay: boolean;
}

// Keys are weekday numbers "0"-"6" (0 = Sunday). A missing key or an empty
// array means closed that day; multiple ranges mean a split shift. A valid
// submission carries all seven keys. Shape validation lives on the DTO
// (class-validator), not the DB -- same convention as grade ordinals.
export type OperatingHours = Record<string, OperatingHoursRange[]>;

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

  // Foundation Revision Sept 3 2026 (AR-51, BL-x04/x06): now set ONCE, at
  // submission, with >= 1 discipline required (DTO-enforced). Verification
  // only confirms the submission is accurate -- it no longer re-collects or
  // unions disciplines (the pre-Sept-3 AR-17 "union the four verifiers'
  // arrays" step is removed). Default '{}' kept only for the migration's
  // sake; a real insert always supplies a non-empty array.
  @Column({
    name: 'disciplines_offered',
    type: 'enum',
    enum: GymDiscipline,
    enumName: 'gym_discipline',
    array: true,
    default: '{}',
  })
  disciplinesOffered: GymDiscipline[];

  // Foundation Revision Sept 3 2026 (AR-51, BL-x04). Migration
  // AddGymOperatingHoursAndTimezone. See OperatingHours above for the shape.
  @Column({
    name: 'operating_hours',
    type: 'jsonb',
    default: () => `'{}'::jsonb`,
  })
  operatingHours: OperatingHours;

  // IANA zone (e.g. "America/New_York") derived from `location` at
  // submission via the offline `tz-lookup` package. NOT NULL in the DB; no
  // default after the migration, so every insert must supply one.
  @Column({ name: 'iana_timezone', type: 'text' })
  ianaTimezone: string;

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
