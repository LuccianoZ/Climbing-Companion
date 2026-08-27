import { IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';

// BL-015: mirrors SubmitRouteVerificationDto.gradeOrdinal's validation
// convention exactly (0-31, the shared V-scale/rope-scale ordinal range --
// Architecture §1) -- this DTO isn't discipline-aware either, same as that
// one, so a Bouldering route's vote could technically be validated up to
// 31 rather than the tighter 0-18 V-scale range. Not a new gap: BL-009's
// SubmitRouteVerificationDto already accepts this same flat range, so
// this mirrors an existing, accepted convention rather than introducing
// one. latitude/longitude are optional for the same reason as every other
// location-bearing DTO in this codebase (AR-16): X-Test-Mock-GPS may
// already have resolved a location before this DTO is even inspected.
export class VoteOnGradeDto {
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
