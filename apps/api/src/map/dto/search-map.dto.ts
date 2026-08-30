import { IsString, MaxLength, MinLength } from 'class-validator';

// BL-022. `q` is the only input the map's search box sends. Length is
// bounded at both ends: an empty term would ILIKE '%%' and return the whole
// dataset, and a 100-char term is already longer than the longest name any
// of the three searched tables can hold (`name varchar(100)` on routes,
// crags and gyms alike), so anything past it cannot match by construction.
export class SearchMapDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q: string;
}
