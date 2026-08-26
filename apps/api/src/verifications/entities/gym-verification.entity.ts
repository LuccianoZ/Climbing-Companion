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
// grade vote (gyms have no grade-consensus concept), plus
// disciplines_submitted, which BL-011's 4th verification unions into
// gyms.disciplines_offered. The mandatory dedupe UNIQUE
// (verifier_user_id, gym_id) constraint lives in the migration, not as an
// @Unique() decorator here -- synchronize is permanently false, same
// reasoning as route-verification.entity.ts.
@Entity('gym_verifications')
export class GymVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'gym_id', type: 'uuid' })
  gymId: string;

  @Column({ name: 'verifier_user_id', type: 'uuid' })
  verifierUserId: string;

  @Column({ name: 'media_asset_id', type: 'uuid' })
  mediaAssetId: string;

  @Column({
    name: 'disciplines_submitted',
    type: 'enum',
    enum: GymDiscipline,
    enumName: 'gym_discipline',
    array: true,
  })
  disciplinesSubmitted: GymDiscipline[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
