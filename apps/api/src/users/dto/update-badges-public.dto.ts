import { IsBoolean } from 'class-validator';

// BL-x09 (Epic 8, AR-53, Sept 7, 2026). Independent of the existing
// photo-gallery `is_private` toggle (BL-047, not yet built).
export class UpdateBadgesPublicDto {
  @IsBoolean()
  badgesPublic: boolean;
}
