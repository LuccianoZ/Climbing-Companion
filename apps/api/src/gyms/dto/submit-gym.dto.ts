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
import { IsCleanText } from '../../common/profanity/is-clean-text.validator';
import { IsOperatingHours } from '../../common/validation/is-operating-hours.validator';
import type { OperatingHours } from '../../common/validation/is-operating-hours.validator';
import { GymDiscipline } from '../entities/gym.entity';
import { MIN_SUBMISSION_PHOTOS } from '../../common/media/link-submission-photos.util';

// Architecture.md §3 `gyms` / Foundation §4 + Sept 3 revision (AR-51,
// BL-x04): a gym submission is no longer just name + coordinates. It now
// carries, authoritatively at submission time:
//   - >= 1 offered discipline (the AR-17 "union the four verifiers' arrays
//     on the 4th verification" step is deleted -- verification only
//     *confirms* now, BL-x06);
//   - Sunday-Saturday operating hours (all 7 keys; shape validated by
//     @IsOperatingHours, not the DB);
//   - >= 3 photo ids, pre-uploaded via POST /api/media with
//     purpose = GYM_SUBMISSION_PHOTO.
// The gym's IANA timezone is NOT a DTO field -- GymsService derives it from
// the coordinates via the offline `tz-lookup` package.
export class SubmitGymDto {
  // BL-026: profanity gateway on gym names (Foundation §10), same as
  // SubmitRouteDto.name.
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsCleanText()
  name: string;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(GymDiscipline, { each: true })
  disciplinesOffered: GymDiscipline[];

  @IsOperatingHours()
  operatingHours: OperatingHours;

  @IsArray()
  @ArrayMinSize(MIN_SUBMISSION_PHOTOS)
  @IsUUID(undefined, { each: true })
  photoMediaIds: string[];

  // BL-x02: the submitter's live device location, used only for the
  // non-admin 300m proximity gate (skipped for SYSTEM_ADMIN). Optional at
  // the DTO layer: a Cucumber scenario supplies it via X-Test-Mock-GPS,
  // resolved by MockGpsGuard before this DTO is inspected (AR-16). When
  // neither is present the controller falls back to the pin coordinates
  // themselves (a client that auto-placed the pin at the device position).
  @IsOptional()
  @IsLatitude()
  deviceLatitude?: number;

  @IsOptional()
  @IsLongitude()
  deviceLongitude?: number;
}
