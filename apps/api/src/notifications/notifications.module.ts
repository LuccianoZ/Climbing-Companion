import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Architecture.md §7 / AR-43: the `notifications` table is pulled forward
// from Epic 7 for BL-028's in-app alerts. NotificationsService is exported
// so ModerationModule can write IMAGE_REJECTED / STRIKE_ISSUED rows inside
// its own transaction.
@Module({
  imports: [TypeOrmModule.forFeature([Notification]), AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
