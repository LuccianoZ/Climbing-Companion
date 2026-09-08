import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Friendship } from './entities/friendship.entity';
import { FriendshipsController } from './friendships.controller';
import { FriendshipsService } from './friendships.service';

// Architecture.md §7 `friendships`, AR-53 (Sept 7, 2026), reworked in AR-55
// (Sept 7, 2026 -- Part 2) to invite-link friendship. FriendshipsService is
// exported so GymActivityModule can gate badge/streak visibility on
// `areFriends()` and FriendInviteLinksModule can call
// `createActiveFriendship()` on redemption.
@Module({
  imports: [TypeOrmModule.forFeature([Friendship]), AuthModule],
  controllers: [FriendshipsController],
  providers: [FriendshipsService],
  exports: [FriendshipsService],
})
export class FriendshipsModule {}
