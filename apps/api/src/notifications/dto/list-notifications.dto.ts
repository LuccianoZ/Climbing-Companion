import { IsISO8601, IsOptional } from 'class-validator';

// GET /api/notifications?since=<ISO timestamp>. `since` is the client's
// last_checked_timestamp (§19.2) -- optional, since the first load has no
// prior checkpoint.
export class ListNotificationsDto {
  @IsOptional()
  @IsISO8601()
  since?: string;
}
