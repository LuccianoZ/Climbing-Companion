import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

// Sept 7, 2026 (AR-54): the original submitter adding more photos after the
// fact -- no upper cap, unlike SubmitGymDto's >= 3 floor at submission time.
export class AddGymPhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  photoMediaIds: string[];
}
