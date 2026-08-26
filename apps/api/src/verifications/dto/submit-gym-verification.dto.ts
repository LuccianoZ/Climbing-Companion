import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { GymDiscipline } from '../../gyms/entities/gym.entity';

// BL-011 / Architecture.md §4: no grade-vote field applies here at all
// (unlike SubmitRouteVerificationDto) -- gyms have no grade-consensus
// concept. disciplinesSubmitted requires at least one entry (TestInventory:
// "requires photo + at least one discipline checkbox"). latitude/longitude
// stay optional at the DTO layer for the same AR-16 reason as the route
// verification DTO -- a Cucumber scenario supplies the verifier's location
// via X-Test-Mock-GPS instead, resolved by MockGpsGuard before this DTO is
// even inspected.
export class SubmitGymVerificationDto {
  @IsUUID()
  mediaAssetId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(GymDiscipline, { each: true })
  disciplinesSubmitted: GymDiscipline[];

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
