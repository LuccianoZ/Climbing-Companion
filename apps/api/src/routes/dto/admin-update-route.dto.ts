import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GearRequirement, OutdoorDiscipline } from '../entities/route.entity';
import { IsCleanText } from '../../common/profanity/is-clean-text.validator';
import { MIN_SUBMISSION_PHOTOS } from '../../common/media/link-submission-photos.util';

// Foundation Revision Sept 3 2026 (AR-51, BL-x07 / §14): an admin may
// rewrite ANY field of any outdoor climb from any location, no reason row.
// Every field is optional. The name passes the profanity gateway (§10).
//
// The bolt-count / rope-length rule (forbidden for BOULDERING) is NOT
// cross-validated here the way SubmitRouteDto does it: an admin edit may
// touch only `summary`, leaving `discipline` and the two rope-only fields
// as they already are in the row, and the DTO cannot see the stored values.
// GymsService/RoutesService applies the change field-by-field; the DB CHECK
// constraint still backstops an incoherent combination.
export class AdminUpdateRouteDto {
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
  @IsEnum(OutdoorDiscipline)
  discipline?: OutdoorDiscipline;

  @IsOptional()
  @IsArray()
  @IsEnum(GearRequirement, { each: true })
  gearRequirements?: GearRequirement[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  summary?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(31)
  proposedGradeOrdinal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  boltCount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  minRopeLengthM?: number | null;

  // Sept 3 admin-stewardship extension: the full desired photo set.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(MIN_SUBMISSION_PHOTOS)
  @IsUUID(undefined, { each: true })
  photoMediaIds?: string[];
}
