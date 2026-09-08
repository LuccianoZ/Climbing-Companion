import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCleanText } from '../../common/profanity/is-clean-text.validator';
import { ReviewTargetType } from '../entities/review.entity';

// BL-045. `body` is mandatory (Foundation §12: "mandatory text <= 250
// characters"), passes the §10 profanity gateway before the controller,
// and is capped at the 250-char user-content ceiling. `mediaAssetId` is
// the optional photo -- a pre-uploaded REVIEW_PHOTO the service checks is
// owned by the author and not already used by another review.
export class CreateReviewDto {
  @IsEnum(ReviewTargetType)
  targetType: ReviewTargetType;

  @IsUUID()
  targetId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  @IsCleanText()
  body: string;

  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;
}
