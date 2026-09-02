import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Gym } from '../gyms/entities/gym.entity';
import { GymCheckin } from './entities/gym-checkin.entity';
import { GymCheckinsController } from './gym-checkins.controller';
import { GymCheckinsService } from './gym-checkins.service';

// Epic 5 (Sprint 3, BL-024). A new top-level module rather than folding
// into GymsModule -- following the precedent GradeVotesModule/
// ClimbLogsModule already set for a 300m-gated action on its own table
// (GymsModule stays "submit and admin-verify a gym", not "every gym
// sub-resource"). Imports the Gym entity directly (not GymsService) for the
// same reason ClimbLogsModule imports Route directly rather than
// RoutesService: this module only ever reads a gym to check it exists.
@Module({
  imports: [TypeOrmModule.forFeature([Gym, GymCheckin]), AuthModule],
  controllers: [GymCheckinsController],
  providers: [GymCheckinsService],
})
export class GymCheckinsModule {}
