import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MODERATION_REASON_MAX_LENGTH } from '../../moderation/entities/media-moderation-action.entity';

// BL-011 + Sept 3 revision (AR-51, BL-x06): gym verification is now a
// confirm/dispute step, not a data-re-entry step.
//
//   - `informationAccurate: true`  -> "Yes, the submission is accurate."
//     Counts toward the 4-verifier gate. The photo is now OPTIONAL (was
//     required); disciplines are NOT collected here at all (the gym's
//     disciplines_offered is authoritative from submission, BL-x04 -- the
//     AR-17 union-on-4th-verification step is deleted).
//   - `informationAccurate: false` -> "No." `disputeDetail` (what is
//     inaccurate?) becomes required, is capped at the 500-char admin-record
//     ceiling, and is routed to the Admin Dashboard as a
//     gym_information_disputes row. It does NOT count toward the 4.
//
// latitude/longitude stay optional for the same AR-16 reason as before -- a
// Cucumber scenario supplies the verifier's location via X-Test-Mock-GPS.
export class SubmitGymVerificationDto {
  @IsBoolean()
  informationAccurate: boolean;

  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  // Required only on a "No" answer.
  @ValidateIf((o: SubmitGymVerificationDto) => o.informationAccurate === false)
  @IsString()
  @MinLength(1)
  @MaxLength(MODERATION_REASON_MAX_LENGTH)
  disputeDetail?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
