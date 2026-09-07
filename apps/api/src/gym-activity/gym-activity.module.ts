import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { FriendshipsModule } from '../friendships/friendships.module';
import { GymBadgesModule } from '../gym-badges/gym-badges.module';
import { GymStreaksModule } from '../gym-streaks/gym-streaks.module';
import { GymActivityController } from './gym-activity.controller';
import { GymActivityService } from './gym-activity.service';

// BL-x09/x10 (Epic 8, AR-53, Sept 7, 2026): the read side of Gym Badges &
// Gym Streaks, composed from the modules that own writes to each table.
@Module({
  imports: [
    AuthModule,
    UsersModule,
    FriendshipsModule,
    GymBadgesModule,
    GymStreaksModule,
  ],
  controllers: [GymActivityController],
  providers: [GymActivityService],
})
export class GymActivityModule {}
