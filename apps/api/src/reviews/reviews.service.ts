import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from '../media/entities/media-asset.entity';
import { Review, ReviewTargetType } from './entities/review.entity';

export interface ReviewView {
  id: string;
  authorId: string;
  authorDisplayName: string;
  body: string;
  // The photo id is surfaced only once an admin has approved it (§10) --
  // null while it is still PENDING or was REJECTED, or when there is none.
  photoMediaId: string | null;
  photoPending: boolean;
  createdAt: string;
}

const TARGET_TABLE: Record<ReviewTargetType, string> = {
  [ReviewTargetType.CRAG]: 'crags',
  [ReviewTargetType.ROUTE]: 'routes',
  [ReviewTargetType.GYM]: 'gyms',
};

// BL-045. Reviews on any crag / route / gym, regardless of lifecycle
// status (Foundation §12) -- no status filter, no 300m gate.
@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviews: Repository<Review>,
    @InjectRepository(MediaAsset)
    private readonly mediaAssets: Repository<MediaAsset>,
  ) {}

  private async assertTargetExists(
    targetType: ReviewTargetType,
    targetId: string,
  ): Promise<void> {
    const table = TARGET_TABLE[targetType];
    const rows: unknown[] = await this.reviews.manager.query(
      `SELECT 1 FROM "${table}" WHERE id = $1`,
      [targetId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(
        `No ${targetType.toLowerCase()} with id ${targetId}`,
      );
    }
  }

  // Validates the optional photo: it must exist, belong to the author, be a
  // REVIEW_PHOTO, and not already be attached to another review. Runs
  // before the insert so a bad photo id is a 400 with no review persisted.
  private async assertPhotoUsable(
    mediaAssetId: string,
    authorId: string,
  ): Promise<void> {
    const asset = await this.mediaAssets.findOne({
      where: { id: mediaAssetId },
    });
    if (!asset) {
      throw new BadRequestException('The review photo was not found');
    }
    if (asset.ownerUserId !== authorId) {
      throw new BadRequestException(
        'A review photo must have been uploaded by the review author',
      );
    }
    if (asset.purpose !== MediaPurpose.REVIEW_PHOTO) {
      throw new BadRequestException(
        `Photo "${mediaAssetId}" was not uploaded with purpose REVIEW_PHOTO`,
      );
    }
    const inUse = await this.reviews.count({ where: { mediaAssetId } });
    if (inUse > 0) {
      throw new BadRequestException(
        `Photo "${mediaAssetId}" is already attached to another review`,
      );
    }
  }

  async create(
    authorId: string,
    targetType: ReviewTargetType,
    targetId: string,
    body: string,
    mediaAssetId?: string,
  ): Promise<Review> {
    await this.assertTargetExists(targetType, targetId);
    if (mediaAssetId) {
      await this.assertPhotoUsable(mediaAssetId, authorId);
    }

    const review = this.reviews.create({
      targetType,
      targetCragId: targetType === ReviewTargetType.CRAG ? targetId : null,
      targetRouteId: targetType === ReviewTargetType.ROUTE ? targetId : null,
      targetGymId: targetType === ReviewTargetType.GYM ? targetId : null,
      authorId,
      body,
      mediaAssetId: mediaAssetId ?? null,
    });
    return this.reviews.save(review);
  }

  // Public (Foundation §2: Visitors can read ratings/reviews). Newest first,
  // joined with the author for a display name and with the photo so an
  // APPROVED image is surfaced and a still-PENDING one is signalled but
  // withheld (§10).
  async listForTarget(
    targetType: ReviewTargetType,
    targetId: string,
  ): Promise<ReviewView[]> {
    await this.assertTargetExists(targetType, targetId);

    const column = {
      [ReviewTargetType.CRAG]: 'target_crag_id',
      [ReviewTargetType.ROUTE]: 'target_route_id',
      [ReviewTargetType.GYM]: 'target_gym_id',
    }[targetType];

    const rows: Array<{
      id: string;
      authorId: string;
      authorDisplayName: string;
      body: string;
      mediaAssetId: string | null;
      moderationStatus: MediaModerationStatus | null;
      createdAt: Date;
    }> = await this.reviews.manager.query(
      `SELECT r.id AS "id",
              r.author_id AS "authorId",
              u.display_name AS "authorDisplayName",
              r.body AS "body",
              r.media_asset_id AS "mediaAssetId",
              m.moderation_status AS "moderationStatus",
              r.created_at AS "createdAt"
         FROM reviews r
         JOIN users u ON u.id = r.author_id
    LEFT JOIN media_assets m ON m.id = r.media_asset_id
        WHERE r.${column} = $1
     ORDER BY r.created_at DESC`,
      [targetId],
    );

    return rows.map((row) => {
      const approved =
        row.mediaAssetId !== null &&
        row.moderationStatus === MediaModerationStatus.APPROVED;
      const pending =
        row.mediaAssetId !== null &&
        row.moderationStatus === MediaModerationStatus.PENDING;
      return {
        id: row.id,
        authorId: row.authorId,
        authorDisplayName: row.authorDisplayName,
        body: row.body,
        photoMediaId: approved ? row.mediaAssetId : null,
        photoPending: pending,
        createdAt: new Date(row.createdAt).toISOString(),
      };
    });
  }
}
