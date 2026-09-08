import { IsEnum, IsUUID } from 'class-validator';
import { ReviewTargetType } from '../entities/review.entity';

// GET /api/reviews?targetType=&targetId= -- the query shape for a target's
// review list. Public read (Foundation §2).
export class ListReviewsDto {
  @IsEnum(ReviewTargetType)
  targetType: ReviewTargetType;

  @IsUUID()
  targetId: string;
}
