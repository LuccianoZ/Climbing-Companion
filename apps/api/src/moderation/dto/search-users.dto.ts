import { IsString, MaxLength, MinLength } from 'class-validator';

// BL-033 / §14 (admin User Account Audit). `q` is the only input the audit
// view's typeahead sends. Bounded at both ends for the same reasons as
// SearchMapDto: an empty term would ILIKE '%%' and return every account,
// and the longest thing this can match is `users.email`, so a term past
// that length cannot match by construction.
//
// This is NOT the user directory Foundation §18 cuts from MVP. That cut is
// about climbers discovering strangers to friend (§12 -- friending is
// invite-link-only, with no discovery surface by design, per §21 risk 11).
// This endpoint is SYSTEM_ADMIN-gated and exists so an admin can reach an
// account to moderate it (§14), which the Foundation has always assumed --
// it just assumed the admin already had the uuid in hand.
export class SearchUsersDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  q: string;
}
