import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import {
  MediaAsset,
  MediaModerationStatus,
  MediaPurpose,
} from './entities/media-asset.entity';

// The MIME allowlist and byte cap are already enforced by the time a request
// reaches here -- see media-upload.options.ts (AR-15). This service assumes
// `file` already passed the gateway and only owns the actual write/read.
export interface UploadedMediaFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaAssets: Repository<MediaAsset>,
  ) {}

  async uploadMedia(
    ownerUserId: string,
    purpose: MediaPurpose,
    file: UploadedMediaFile,
  ): Promise<MediaAsset> {
    // Architecture §6: etag is a hash of the payload, computed at insert.
    const etag = createHash('sha256').update(file.buffer).digest('hex');

    const asset = this.mediaAssets.create({
      ownerUserId,
      purpose,
      payload: file.buffer,
      mimeType: file.mimetype,
      byteSize: file.size,
      moderationStatus: MediaModerationStatus.PENDING,
      etag,
    });
    return this.mediaAssets.save(asset);
  }

  async findById(id: string): Promise<MediaAsset> {
    const asset = await this.mediaAssets.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`Media asset "${id}" not found`);
    }
    return asset;
  }
}
