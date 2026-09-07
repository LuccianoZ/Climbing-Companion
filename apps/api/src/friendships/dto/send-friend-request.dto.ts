import { IsUUID } from 'class-validator';

// BL-x11 (Epic 8, pulled forward from BL-039).
export class SendFriendRequestDto {
  @IsUUID()
  addresseeId: string;
}
