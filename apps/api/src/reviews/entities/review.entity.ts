import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ReviewTargetType {
  CRAG = 'CRAG',
  ROUTE = 'ROUTE',
  GYM = 'GYM',
}

// Architecture.md §7 `reviews`, Epic 9 BL-045. One row per review, on
// exactly one of a crag / route / gym (the CHK_reviews_one_target CHECK,
// keyed on `targetType`). Mandatory body <= 250 chars; optional
// `mediaAssetId` points at a REVIEW_PHOTO that moves through the §10
// pending queue like any community upload.
@Index('IDX_reviews_target_crag_id', ['targetCragId'])
@Index('IDX_reviews_target_route_id', ['targetRouteId'])
@Index('IDX_reviews_target_gym_id', ['targetGymId'])
@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: ReviewTargetType,
    enumName: 'review_target_type',
  })
  targetType: ReviewTargetType;

  @Column({ name: 'target_crag_id', type: 'uuid', nullable: true })
  targetCragId: string | null;

  @Column({ name: 'target_route_id', type: 'uuid', nullable: true })
  targetRouteId: string | null;

  @Column({ name: 'target_gym_id', type: 'uuid', nullable: true })
  targetGymId: string | null;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @Column({ type: 'varchar', length: 250 })
  body: string;

  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true })
  mediaAssetId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
