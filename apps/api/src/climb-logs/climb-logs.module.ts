import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Route } from '../routes/entities/route.entity';
import { GradeVotesModule } from '../grade-votes/grade-votes.module';
import { ClimbLog } from './entities/climb-log.entity';
import { ClimbLogsController } from './climb-logs.controller';
import { ClimbLogsService } from './climb-logs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Route, ClimbLog]),
    AuthModule,
    GradeVotesModule,
  ],
  controllers: [ClimbLogsController],
  providers: [ClimbLogsService],
})
export class ClimbLogsModule {}
