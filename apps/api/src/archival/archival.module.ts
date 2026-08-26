import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Route } from '../routes/entities/route.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { Crag } from '../crags/entities/crag.entity';
import { ArchivalService } from './archival.service';
import { ArchivalCronService } from './archival-cron.service';

@Module({
  imports: [TypeOrmModule.forFeature([Route, Gym, Crag])],
  providers: [ArchivalService, ArchivalCronService],
  exports: [ArchivalService],
})
export class ArchivalModule {}
