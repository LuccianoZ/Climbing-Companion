import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GymStreak } from './entities/gym-streak.entity';
import { GymStreaksService } from './gym-streaks.service';

// Architecture.md AR-53 (Sept 7, 2026), BL-x10. Exported so
// GymCheckinsModule can record a streak inside its own check-in
// transaction, and so GymActivityModule can read a user's streaks.
@Module({
  imports: [TypeOrmModule.forFeature([GymStreak])],
  providers: [GymStreaksService],
  exports: [GymStreaksService],
})
export class GymStreaksModule {}
