import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

// Architecture.md §4 `route_verifications`. BL-009: the first table in the
// three-part verification transaction (VerificationService.
// submitRouteVerification) -- insert this row, upsert the matching
// RouteGradeVote row, then re-check the running count. The mandatory
// dedupe UNIQUE (verifier_user_id, route_id) constraint lives in the
// migration, not as an @Unique() decorator here -- synchronize is
// permanently false (Foundation §20.1), so decorator-driven constraint
// creation never actually runs; see crag.entity.ts's location comment for
// the same reasoning applied to indexes.
@Entity('route_verifications')
export class RouteVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'route_id', type: 'uuid' })
  routeId: string;

  @Column({ name: 'verifier_user_id', type: 'uuid' })
  verifierUserId: string;

  @Column({ name: 'media_asset_id', type: 'uuid' })
  mediaAssetId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
