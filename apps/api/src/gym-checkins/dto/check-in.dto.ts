import { IsLatitude, IsLongitude, IsOptional } from 'class-validator';

// BL-024: mirrors LogClimbDto's shape -- a check-in carries no data of its
// own beyond "I am here" (Architecture §5's gym_checkins has no column this
// DTO would populate besides the FKs and timestamp, both resolved
// server-side), so this DTO exists solely to carry the optional
// latitude/longitude pair every other 300m-gated action takes on its real
// (non-test) path (AR-16) -- X-Test-Mock-GPS may already have resolved a
// location before this DTO is even inspected.
export class CheckInDto {
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
