import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ReviewsService } from './reviews.service';

// BL-045. Writing a review needs a session; reading the list is public
// (Foundation §2: Visitors see ratings/reviews).
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  async create(@Body() dto: CreateReviewDto, @Req() req: AuthenticatedRequest) {
    const review = await this.reviewsService.create(
      req.user.id,
      dto.targetType,
      dto.targetId,
      dto.body,
      dto.mediaAssetId,
    );
    return {
      id: review.id,
      targetType: review.targetType,
      body: review.body,
      mediaAssetId: review.mediaAssetId,
      createdAt: review.createdAt.toISOString(),
    };
  }

  @Get()
  list(@Query() query: ListReviewsDto) {
    return this.reviewsService.listForTarget(query.targetType, query.targetId);
  }
}
