import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import type { Request, Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { MEDIA_UPLOAD_INTERCEPTOR_OPTIONS } from './media-upload.options';

// BL-008 / Architecture.md AR-15: POST requires SessionGuard (an
// owner_user_id is mandatory on every row, so an upload always needs an
// authenticated caller). GET does not -- BL-008's own ACs specify no
// access-control requirement, and visibility gating by moderation_status
// is BL-027's job (Epic 6, Sprint 3), not this gateway's.
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
    // The MIME allowlist and 2MB cap are already enforced by
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
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const asset = await this.mediaService.findById(id);
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
}
