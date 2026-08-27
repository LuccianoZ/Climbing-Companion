import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Route } from '../routes/entities/route.entity';
import { RouteGradeVote } from '../verifications/entities/route-grade-vote.entity';
import { GradeVotesController } from './grade-votes.controller';
import { GradeVoteService } from './grade-vote.service';

// BL-015 / BL-016: a new module rather than folding into
// VerificationsModule -- grading is conceptually distinct from
// verification (Foundation treats them as separate sections, §5 vs §6),
// and BL-015's standalone vote action never touches route_verifications
// at all. Exports GradeVoteService so ClimbLogsModule (BL-017/018) can
// reuse computeConsensus() for the grade snapshot.
@Module({
  imports: [TypeOrmModule.forFeature([Route, RouteGradeVote]), AuthModule],
  controllers: [GradeVotesController],
  providers: [GradeVoteService],
  exports: [GradeVoteService],
})
export class GradeVotesModule {}
