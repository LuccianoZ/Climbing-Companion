import {
  IsLatitude,
  IsLongitude,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCleanText } from '../../common/profanity/is-clean-text.validator';

// Architecture.md §3 `gyms` / Foundation §4: a gym submission is just a
// standalone pin -- name and coordinates. Unlike routes, there is no
// discipline/gear/summary/grade form here: disciplines_offered is
// populated later by BL-011's verification union, not collected at
// submission time (see the comment on Gym.disciplinesOffered).
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
}
