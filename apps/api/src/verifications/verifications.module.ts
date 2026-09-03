import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Route } from '../routes/entities/route.entity';
import { Crag } from '../crags/entities/crag.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { RouteVerification } from './entities/route-verification.entity';
import { RouteGradeVote } from './entities/route-grade-vote.entity';
import { GymVerification } from './entities/gym-verification.entity';
import { GymInformationDispute } from './entities/gym-information-dispute.entity';
import { RouteVerificationsController } from './verifications.controller';
import { GymVerificationsController } from './gym-verifications.controller';
import { AdminGymDisputesController } from './admin-gym-disputes.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RouteVerification,
      RouteGradeVote,
      GymVerification,
      GymInformationDispute,
      Route,
      Crag,
      Gym,
    ]),
    AuthModule,
  ],
  controllers: [
    RouteVerificationsController,
    GymVerificationsController,
    AdminGymDisputesController,
  ],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationsModule {}
