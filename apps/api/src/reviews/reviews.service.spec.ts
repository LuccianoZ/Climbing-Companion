import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ReviewsService } from './reviews.service';
import { Review, ReviewTargetType } from './entities/review.entity';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from '../media/entities/media-asset.entity';

describe('ReviewsService', () => {
  const author = 'user-author';
  const targetId = '11111111-1111-1111-1111-111111111111';

  let reviewRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    manager: { query: ReturnType<typeof vi.fn> };
  };
  let mediaRepo: { findOne: ReturnType<typeof vi.fn> };
  let service: ReviewsService;

  function photo(overrides: Partial<MediaAsset> = {}): MediaAsset {
    return {
      id: 'photo-1',
      ownerUserId: author,
      purpose: MediaPurpose.REVIEW_PHOTO,
      moderationStatus: MediaModerationStatus.PENDING,
      ...overrides,
    } as MediaAsset;
  }

  beforeEach(() => {
    reviewRepo = {
      create: vi.fn((data: Partial<Review>) => ({ id: 'review-1', ...data })),
      save: vi.fn((r: Review) => ({ ...r, createdAt: new Date() })),
      count: vi.fn().mockResolvedValue(0),
      manager: { query: vi.fn() },
    };
    mediaRepo = { findOne: vi.fn() };
    service = new ReviewsService(
      reviewRepo as unknown as Repository<Review>,
      mediaRepo as unknown as Repository<MediaAsset>,
    );
  });

  describe('create', () => {
    it('inserts a review against the right target column when the target exists', async () => {
      reviewRepo.manager.query.mockResolvedValue([{ '?column?': 1 }]);

      await service.create(
        author,
        ReviewTargetType.GYM,
        targetId,
        'Great bouldering wall',
      );

      expect(reviewRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM "gyms"'),
        [targetId],
      );
      expect(reviewRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: ReviewTargetType.GYM,
          targetGymId: targetId,
          targetCragId: null,
          targetRouteId: null,
          authorId: author,
          body: 'Great bouldering wall',
          mediaAssetId: null,
        }),
      );
    });

    it('404s when the target does not exist', async () => {
      reviewRepo.manager.query.mockResolvedValue([]);
      await expect(
        service.create(author, ReviewTargetType.ROUTE, targetId, 'x'),
      ).rejects.toThrow(NotFoundException);
    });

    it('accepts an owned, unused REVIEW_PHOTO', async () => {
      reviewRepo.manager.query.mockResolvedValue([{ ok: 1 }]);
      mediaRepo.findOne.mockResolvedValue(photo());
      reviewRepo.count.mockResolvedValue(0);

      await service.create(
        author,
        ReviewTargetType.CRAG,
        targetId,
        'Solid',
        'photo-1',
      );

      expect(reviewRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaAssetId: 'photo-1',
          targetCragId: targetId,
        }),
      );
    });

    it('rejects a photo owned by someone else', async () => {
      reviewRepo.manager.query.mockResolvedValue([{ ok: 1 }]);
      mediaRepo.findOne.mockResolvedValue(
        photo({ ownerUserId: 'someone-else' }),
      );
      await expect(
        service.create(author, ReviewTargetType.CRAG, targetId, 'x', 'photo-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a photo with the wrong purpose', async () => {
      reviewRepo.manager.query.mockResolvedValue([{ ok: 1 }]);
      mediaRepo.findOne.mockResolvedValue(
        photo({ purpose: MediaPurpose.PROFILE_PHOTO }),
      );
      await expect(
        service.create(author, ReviewTargetType.CRAG, targetId, 'x', 'photo-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a photo already attached to another review', async () => {
      reviewRepo.manager.query.mockResolvedValue([{ ok: 1 }]);
      mediaRepo.findOne.mockResolvedValue(photo());
      reviewRepo.count.mockResolvedValue(1);
      await expect(
        service.create(author, ReviewTargetType.CRAG, targetId, 'x', 'photo-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a missing photo id', async () => {
      reviewRepo.manager.query.mockResolvedValue([{ ok: 1 }]);
      mediaRepo.findOne.mockResolvedValue(null);
      await expect(
        service.create(author, ReviewTargetType.CRAG, targetId, 'x', 'photo-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listForTarget', () => {
    it('surfaces an APPROVED photo id and withholds a PENDING one', async () => {
      reviewRepo.manager.query
        .mockResolvedValueOnce([{ ok: 1 }]) // assertTargetExists
        .mockResolvedValueOnce([
          {
            id: 'r1',
            authorId: 'a',
            authorDisplayName: 'A',
            body: 'approved photo',
            mediaAssetId: 'm1',
            moderationStatus: MediaModerationStatus.APPROVED,
            createdAt: new Date('2026-09-07T10:00:00Z'),
          },
          {
            id: 'r2',
            authorId: 'b',
            authorDisplayName: 'B',
            body: 'pending photo',
            mediaAssetId: 'm2',
            moderationStatus: MediaModerationStatus.PENDING,
            createdAt: new Date('2026-09-07T09:00:00Z'),
          },
          {
            id: 'r3',
            authorId: 'c',
            authorDisplayName: 'C',
            body: 'no photo',
            mediaAssetId: null,
            moderationStatus: null,
            createdAt: new Date('2026-09-07T08:00:00Z'),
          },
        ]);

      const result = await service.listForTarget(
        ReviewTargetType.ROUTE,
        targetId,
      );

      expect(result[0]).toMatchObject({
        id: 'r1',
        photoMediaId: 'm1',
        photoPending: false,
      });
      expect(result[1]).toMatchObject({
        id: 'r2',
        photoMediaId: null,
        photoPending: true,
      });
      expect(result[2]).toMatchObject({
        id: 'r3',
        photoMediaId: null,
        photoPending: false,
      });
    });

    it('404s an unknown target', async () => {
      reviewRepo.manager.query.mockResolvedValueOnce([]);
      await expect(
        service.listForTarget(ReviewTargetType.GYM, targetId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
