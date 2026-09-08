import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FriendshipsModule } from '../friendships/friendships.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FriendInviteLink } from './entities/friend-invite-link.entity';
import { FriendInviteLinksController } from './friend-invite-links.controller';
import { FriendInviteLinksService } from './friend-invite-links.service';

// Architecture §7 `friend_invite_links`, AR-55 (Sept 7, 2026 -- Part 2).
// Imports FriendshipsModule for `createActiveFriendship` and
// NotificationsModule for the FRIEND_ADDED alert raised on redemption --
// both called inside this module's own redemption transaction.
@Module({
  imports: [
    TypeOrmModule.forFeature([FriendInviteLink]),
    AuthModule,
    FriendshipsModule,
    NotificationsModule,
  ],
  controllers: [FriendInviteLinksController],
  providers: [FriendInviteLinksService],
  exports: [FriendInviteLinksService],
})
export class FriendInviteLinksModule {}
