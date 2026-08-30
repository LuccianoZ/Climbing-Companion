import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Crag } from '../crags/entities/crag.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { Route } from '../routes/entities/route.entity';
import { GradeVotesModule } from '../grade-votes/grade-votes.module';
import { MapController } from './map.controller';
import { MapService } from './map.service';

// Epic 4 (BL-019-022) / Architecture.md AR-19. Imports GradeVotesModule
// for its exported GradeVoteService -- the detail panel's per-route grade
// is BL-016's plurality consensus, reused rather than re-derived (the same
// reuse ClimbLogsModule already does for its grade snapshot, AR-18).
// AuthModule is deliberately NOT imported: nothing on this module is
// guarded (see MapController).
@Module({
  imports: [TypeOrmModule.forFeature([Crag, Gym, Route]), GradeVotesModule],
  controllers: [MapController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
