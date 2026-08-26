import multer from 'multer';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import {
  ALLOWED_MEDIA_MIME_TYPES,
  MAX_MEDIA_BYTES,
} from './entities/media-asset.entity';

// Architecture.md AR-15 / Foundation §19.1: the 2MB cap and MIME allowlist
// are enforced here, at the multer/FileInterceptor gateway layer, rather
// than duplicated as an app-level check inside MediaService.
//
// - `limits.fileSize`: multer aborts the parse mid-stream once this is
//   exceeded, so an oversized upload never fully reaches the database (the
//   AC's own wording -- "rejected at the gateway before touching the
//   database"). NestJS's FileInterceptor already maps the resulting
//   MulterError('LIMIT_FILE_SIZE') to a clean PayloadTooLargeException
//   (413) via its built-in transformException -- verified by reading
//   node_modules/@nestjs/platform-express/multer/multer/multer.utils.js.
// - `fileFilter`: an HttpException passed to multer's callback here is
//   forwarded unchanged by that same transformException (it only rewrites
//   plain multer/busboy errors), so throwing UnsupportedMediaTypeException
//   (415) directly is the clean path -- no generic 500 fallback.
//
// Exported so every future upload endpoint (BL-009/011/045 verification and
// review photos) reuses these exact gateway guarantees instead of each
// re-deriving its own limits/fileFilter.
export const MEDIA_UPLOAD_INTERCEPTOR_OPTIONS: MulterModuleOptions = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MEDIA_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.mimetype)) {
      callback(
        new UnsupportedMediaTypeException(
          `Unsupported MIME type "${file.mimetype}". Allowed: ${ALLOWED_MEDIA_MIME_TYPES.join(', ')}`,
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
