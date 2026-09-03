import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MIN_SUBMISSION_PHOTOS } from '../../common/media/link-submission-photos.util';
import { IsCleanText } from '../../common/profanity/is-clean-text.validator';
import { IsOperatingHours } from '../../common/validation/is-operating-hours.validator';
import type { OperatingHours } from '../../common/validation/is-operating-hours.validator';
import { GymDiscipline } from '../entities/gym.entity';

// Foundation Revision Sept 3 2026 (AR-51, BL-x07 / §14): an admin may
// rewrite ANY field of any gym from any location, no reason row. Every
// field is optional -- only the ones present in the request are changed.
// The name still passes the profanity gateway (§10); coordinates, if
// supplied, re-derive the IANA timezone (GymsService). Taking a gym DOWN is
// force-archive (a separate endpoint), not a field on this DTO.
//
// `latitude` and `longitude` must be supplied together or not at all --
// GymsService enforces that pairing.
export class AdminUpdateGymDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsCleanText()
  name?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(GymDiscipline, { each: true })
  disciplinesOffered?: GymDiscipline[];

  @IsOptional()
  @IsOperatingHours()
  operatingHours?: OperatingHours;

  // Sept 3 admin-stewardship extension: the full desired photo set. New ids
  // are linked + APPROVED, dropped ids unlinked; must stay >= 3.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(MIN_SUBMISSION_PHOTOS)
  @IsUUID(undefined, { each: true })
  photoMediaIds?: string[];
}
