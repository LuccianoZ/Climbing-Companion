import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Friendship } from './entities/friendship.entity';
import { FriendshipsController } from './friendships.controller';
import { FriendshipsService } from './friendships.service';

// Architecture.md §7 `friendships`, AR-53 (Sept 7, 2026), BL-x11.
// FriendshipsService is exported so GymActivityModule can gate badge/streak
// visibility on `areFriends()`.
@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship]),
    AuthModule,
    NotificationsModule,
  ],
  controllers: [FriendshipsController],
  providers: [FriendshipsService],
  exports: [FriendshipsService],
})
export class FriendshipsModule {}
