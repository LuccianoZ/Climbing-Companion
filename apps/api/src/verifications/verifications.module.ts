import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Route } from '../routes/entities/route.entity';
import { Crag } from '../crags/entities/crag.entity';
import { RouteVerification } from './entities/route-verification.entity';
import { RouteGradeVote } from './entities/route-grade-vote.entity';
import { RouteVerificationsController } from './verifications.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RouteVerification, RouteGradeVote, Route, Crag]),
    AuthModule,
  ],
  controllers: [RouteVerificationsController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationsModule {}
