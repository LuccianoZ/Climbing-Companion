import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { OptionalSessionGuard } from '../auth/optional-session.guard';
import type { MaybeAuthenticatedRequest } from '../auth/optional-session.guard';
import { UserRole } from '../users/entities/user.entity';
import { MediaService } from './media.service';
import {
  MediaAsset,
  MediaModerationStatus,
} from './entities/media-asset.entity';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MEDIA_UPLOAD_INTERCEPTOR_OPTIONS } from './media-upload.options';

// BL-008 / Architecture.md AR-15: POST requires SessionGuard (an
// owner_user_id is mandatory on every row, so an upload always needs an
// authenticated caller).
//
// BL-027 (Epic 6): GET is now gated by moderation_status. It stays reachable
// by an anonymous visitor (OptionalSessionGuard never rejects) for an
// APPROVED asset -- the map/profile/review surfaces that embed images are
// public -- but a PENDING or REJECTED asset is visible only to its owner
// and to a SYSTEM_ADMIN. Anyone else gets a 404, not a 403: the existence
// of a hidden asset is not disclosed.
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor('file', MEDIA_UPLOAD_INTERCEPTOR_OPTIONS))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    // The MIME allowlist and byte cap are already enforced by
    // MEDIA_UPLOAD_INTERCEPTOR_OPTIONS before this handler ever runs -- this
    // only guards against the field being omitted entirely.
    if (!file) {
      throw new BadRequestException('A "file" field is required');
    }

    const asset = await this.mediaService.uploadMedia(
      req.user.id,
      dto.purpose,
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        size: file.size,
      },
    );

    return {
      id: asset.id,
      purpose: asset.purpose,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      moderationStatus: asset.moderationStatus,
      etag: asset.etag,
    };
  }

  // Foundation §19.1: binary streaming from a dedicated endpoint with
  // ETag/Cache-Control -- base64-in-JSON banned. @Res() is used directly
  // (rather than Nest's StreamableFile/passthrough) so both the
  // 304-no-body and 200-binary-payload cases get full manual control over
  // headers without fighting Nest's automatic response serialization.
  @Get(':id')
  @UseGuards(OptionalSessionGuard)
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: MaybeAuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const asset = await this.mediaService.findById(id);

    if (!this.viewerMaySee(asset, req.user)) {
      // Same shape a genuinely-missing id produces (MediaService.findById
      // throws NotFoundException) -- a hidden asset is indistinguishable
      // from one that does not exist.
      throw new NotFoundException(`Media asset "${id}" not found`);
    }

    const etag = `"${asset.etag}"`;

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    res.setHeader('Content-Type', asset.mimeType);
    res.status(HttpStatus.OK).send(asset.payload);
  }

  // BL-027: APPROVED is public; PENDING/REJECTED is owner-or-admin only.
  private viewerMaySee(
    asset: MediaAsset,
    viewer: MaybeAuthenticatedRequest['user'],
  ): boolean {
    if (asset.moderationStatus === MediaModerationStatus.APPROVED) {
      return true;
    }
    if (!viewer) {
      return false;
    }
    return (
      viewer.id === asset.ownerUserId || viewer.role === UserRole.SYSTEM_ADMIN
    );
  }
}
