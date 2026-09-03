import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';

// Architecture.md §7 / §9 item 4. Epic 6 uses the write path
// (createNotification, called inside BL-028's transaction) and a minimal
// read path (listForUser, behind GET /api/notifications). Epic 7 folds the
// read path into the unified Messages + Notifications poll endpoint
// (PollService.getUpdatesSince, §19.2) -- this service stays the
// notifications half of that.
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  // Written through the caller's EntityManager so the notification row
  // commits (or rolls back) atomically with the moderation action that
  // raised it -- an IMAGE_REJECTED alert must never outlive a transaction
  // that failed to actually reject the asset.
  async createNotification(
    manager: EntityManager,
    recipientUserId: string,
    type: NotificationType,
    relatedEntityId: string | null,
  ): Promise<Notification> {
    const repo = manager.getRepository(Notification);
    return repo.save(repo.create({ recipientUserId, type, relatedEntityId }));
  }

  // Newest first. `since` is the client's last_checked_timestamp (§19.2):
  // when present, only rows created strictly after it are returned, so the
  // Alerts screen's poll is incremental. Without it, the full history comes
  // back (first load).
  async listForUser(
    recipientUserId: string,
    since?: Date,
  ): Promise<Notification[]> {
    return this.notifications.find({
      where: {
        recipientUserId,
        ...(since ? { createdAt: MoreThan(since) } : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  // Exposed for tests/fixtures that need to assert "a ban produced zero
  // notification rows" (TestInventory) without reaching into the repo.
  async countForUser(recipientUserId: string): Promise<number> {
    return this.notifications.count({ where: { recipientUserId } });
  }
}
