import { IsEnum, IsLatitude, IsLongitude, IsOptional } from 'class-validator';
import { ClimbOutcome } from '../entities/climb-log.entity';

// BL-017/BL-018: outcome is the only thing that differs between "Log as
// Completed" and "Log as Attempted" (Foundation §7 / Trello-Reference.docx
// BL-017: "Two actions, identical mechanics, only outcome differs") --
// modeled as one DTO/one endpoint rather than two, mirroring that
// description directly. latitude/longitude optional for the same
// AR-16 reason as every other 300m-gated DTO in this codebase.
export class LogClimbDto {
  @IsEnum(ClimbOutcome)
  outcome: ClimbOutcome;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
