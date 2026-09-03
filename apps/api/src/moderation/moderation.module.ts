import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { MediaAsset } from '../media/entities/media-asset.entity';
import { User } from '../users/entities/user.entity';
import { MediaReport } from './entities/media-report.entity';
import { MediaModerationAction } from './entities/media-moderation-action.entity';
import { UserAccountabilityAction } from './entities/user-accountability-action.entity';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { AccountabilityService } from './accountability.service';

// Epic 6 (Sprint 3, BL-027/028/029/030). Imports VerificationsModule for
// VerificationService's new void methods (BL-029/AR-47), NotificationsModule
// for the in-app alerts (AR-43), MailModule for the §11 reason emails, and
// AuthModule for the guard pair. MediaAsset / User entities are registered
// here (read+mutated directly) rather than reaching through MediaService /
// a users service -- same convention GymCheckinsModule follows for Gym.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MediaReport,
      MediaModerationAction,
      UserAccountabilityAction,
      MediaAsset,
      User,
    ]),
    AuthModule,
    MailModule,
    NotificationsModule,
    VerificationsModule,
  ],
  controllers: [ModerationController],
  providers: [ModerationService, AccountabilityService],
  exports: [ModerationService, AccountabilityService],
})
export class ModerationModule {}
