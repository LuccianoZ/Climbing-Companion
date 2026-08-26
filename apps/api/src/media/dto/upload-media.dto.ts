import { IsEnum } from 'class-validator';
import { MediaPurpose } from '../entities/media-asset.entity';

// The file itself arrives via multipart (handled by FileInterceptor +
// @UploadedFile(), not this DTO) -- this only validates the accompanying
// "purpose" form field. AR-15: BL-008 is a generic gateway; the calling
// endpoint (profile photo, route/gym verification, review photo) is
// responsible for supplying the correct purpose value, not this DTO.
export class UploadMediaDto {
  @IsEnum(MediaPurpose)
  purpose: MediaPurpose;
}
