import { ArrayMinSize, IsArray, IsEnum } from 'class-validator';
import { GymDiscipline } from '../entities/gym.entity';

// BL-012 / Architecture.md §4: an admin's direct verification enters
// disciplines manually rather than aggregating gym_verifications rows --
// there may be zero such rows at all when this path is used. At least one
// discipline is still required (same floor as the crowd-sourced path,
// SubmitGymVerificationDto) even though there's no vote/consensus involved.
export class AdminVerifyGymDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(GymDiscipline, { each: true })
  disciplinesOffered: GymDiscipline[];
}
