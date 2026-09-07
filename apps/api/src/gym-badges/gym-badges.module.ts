import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GymBadge } from './entities/gym-badge.entity';
import { GymBadgesService } from './gym-badges.service';

// Architecture.md AR-53 (Sept 7, 2026), BL-x09. Exported so
// GymCheckinsModule can mint a badge inside its own check-in transaction,
// and so GymActivityModule can read a user's badge shelf.
@Module({
  imports: [TypeOrmModule.forFeature([GymBadge])],
  providers: [GymBadgesService],
  exports: [GymBadgesService],
})
export class GymBadgesModule {}
