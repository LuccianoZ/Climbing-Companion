import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

// BL-009 / Architecture.md AR-16: latitude/longitude are optional at the
// DTO layer because a Cucumber scenario supplies the verifier's location
// via the X-Test-Mock-GPS header instead (resolved by MockGpsGuard before
// this DTO is even inspected) -- the controller requires *one* of the two
// sources to have supplied a location, not both, mirroring AR-16's "one
// resolved location regardless of where it came from" design. gradeOrdinal
// mirrors SubmitRouteDto.proposedGradeOrdinal's validation convention
// (0-31, the shared V-scale/rope-scale ordinal range -- Architecture §1).
export class SubmitRouteVerificationDto {
  @IsUUID()
  mediaAssetId: string;

  @IsInt()
  @Min(0)
  @Max(31)
  gradeOrdinal: number;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
