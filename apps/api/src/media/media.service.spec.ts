import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Repository } from 'typeorm';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MediaService, UploadedMediaFile } from './media.service';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from './entities/media-asset.entity';

describe('UploadMediaDto validation', () => {
  it('accepts a real MediaPurpose value', async () => {
    const dto = plainToInstance(UploadMediaDto, { purpose: 'PROFILE_PHOTO' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing purpose', async () => {
    const dto = plainToInstance(UploadMediaDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'purpose')).toBe(true);
  });

  it('rejects a purpose that is not one of the media_purpose enum values', async () => {
    const dto = plainToInstance(UploadMediaDto, {
      purpose: 'NOT_A_REAL_PURPOSE',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'purpose')).toBe(true);
  });
});

describe('MediaService', () => {
  let mediaRepo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let service: MediaService;

  const ownerUserId = 'user-1';
  const file: UploadedMediaFile = {
    buffer: Buffer.from('fake-jpeg-bytes'),
    mimetype: 'image/jpeg',
    size: 15,
  };

  beforeEach(() => {
    mediaRepo = {
      create: vi.fn((data: Partial<MediaAsset>) => ({ ...data }) as MediaAsset),
      save: vi.fn((a: MediaAsset) => ({ ...a, id: 'media-1' })),
      findOne: vi.fn(),
    };
    service = new MediaService(mediaRepo as unknown as Repository<MediaAsset>);
  });

  describe('uploadMedia', () => {
    it('writes a PENDING media_assets row with a sha256 etag of the payload', async () => {
      const result = await service.uploadMedia(
        ownerUserId,
        MediaPurpose.PROFILE_PHOTO,
        file,
      );

      expect(mediaRepo.create).toHaveBeenCalledTimes(1);
      const createArg = mediaRepo.create.mock.calls[0][0] as MediaAsset;
      expect(createArg.ownerUserId).toBe(ownerUserId);
      expect(createArg.purpose).toBe(MediaPurpose.PROFILE_PHOTO);
      expect(createArg.payload).toBe(file.buffer);
      expect(createArg.mimeType).toBe(file.mimetype);
      expect(createArg.byteSize).toBe(file.size);
      expect(createArg.moderationStatus).toBe(MediaModerationStatus.PENDING);
      expect(createArg.etag).toBe(
        createHash('sha256').update(file.buffer).digest('hex'),
      );

      expect(mediaRepo.save).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('media-1');
    });

    it('produces different etags for different payloads', async () => {
      const first = await service.uploadMedia(
        ownerUserId,
        MediaPurpose.PROFILE_PHOTO,
        file,
      );
      const second = await service.uploadMedia(
        ownerUserId,
        MediaPurpose.PROFILE_PHOTO,
        {
          ...file,
          buffer: Buffer.from('different-bytes'),
        },
      );
      expect(first.etag).not.toBe(second.etag);
    });
  });

  describe('findById', () => {
    it('returns the asset when it exists', async () => {
      const asset = { id: 'media-1', mimeType: 'image/jpeg' } as MediaAsset;
      mediaRepo.findOne.mockResolvedValue(asset);

      const result = await service.findById('media-1');

      expect(result).toBe(asset);
      expect(mediaRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'media-1' },
      });
    });

    it('throws NotFoundException when no asset matches', async () => {
      mediaRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
