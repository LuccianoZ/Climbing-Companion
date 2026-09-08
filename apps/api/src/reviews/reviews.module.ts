import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MediaAsset } from '../media/entities/media-asset.entity';
import { Review } from './entities/review.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

// Architecture §7 `reviews`, Epic 9 BL-045. Imports the MediaAsset repo for
// the optional-photo validation (owned by the author, REVIEW_PHOTO, not
// already attached) and to read a photo's moderation status when listing.
@Module({
  imports: [TypeOrmModule.forFeature([Review, MediaAsset]), AuthModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
