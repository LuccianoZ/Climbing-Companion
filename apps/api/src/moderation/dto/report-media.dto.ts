import { IsOptional, IsString, MaxLength } from 'class-validator';

// BL-030. POST /api/media/:id/reports. A community report; `reason` is
// optional (it is not the mandatory-reason mechanism -- that is §11,
// admin-only) and capped at the 250-char user-content ceiling.
export class ReportMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;
}
