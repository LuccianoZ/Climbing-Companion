import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { GymDiscipline } from '../../gyms/entities/gym.entity';

// Architecture.md §4 `gym_verifications`. BL-011: the gym analog of
// route_verifications (route-verification.entity.ts) -- same shape minus a
// grade vote (gyms have no grade-consensus concept). The mandatory dedupe
// UNIQUE (verifier_user_id, gym_id) constraint lives in the migration, not
// as an @Unique() decorator here -- synchronize is permanently false, same
// reasoning as route-verification.entity.ts.
//
// Foundation Revision Sept 3 2026 (AR-51, BL-x06): a row is written only
// when the verifier answers "Yes, the submission is accurate". The photo is
// now OPTIONAL and disciplines are no longer collected here at all
// (gyms.disciplines_offered is set at submission) -- both columns are
// nullable, migration RelaxGymVerificationAddDisputes. A "No" answer writes
// a gym_information_disputes row instead (see that entity).
@Entity('gym_verifications')
export class GymVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'gym_id', type: 'uuid' })
  gymId: string;

  @Column({ name: 'verifier_user_id', type: 'uuid' })
  verifierUserId: string;

  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true })
  mediaAssetId: string | null;

  // Retained (nullable) for historical rows and migration reversibility;
  // new writes never populate it.
  @Column({
    name: 'disciplines_submitted',
    type: 'enum',
    enum: GymDiscipline,
    enumName: 'gym_discipline',
    array: true,
    nullable: true,
  })
  disciplinesSubmitted: GymDiscipline[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
