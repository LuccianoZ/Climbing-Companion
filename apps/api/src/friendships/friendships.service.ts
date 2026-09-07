import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Friendship, FriendshipStatus } from './entities/friendship.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

export interface PendingFriendRequest {
  id: string;
  requesterId: string;
  requesterEmail: string;
  requesterDisplayName: string;
  createdAt: string;
}

// Architecture.md §7 `friendships`, AR-53 (Sept 7, 2026), BL-x11 -- pulled
// forward from Epic 9 (BL-039/040) because BL-x09/x10's friend-gating needs
// a friend relation to exist. Only request/accept/decline/unadd is built
// here; directory search (BL-041), DMs, and reviews stay Epic 9.
@Injectable()
export class FriendshipsService {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendships: Repository<Friendship>,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  // AR-5: a UNIQUE (requester_id, addressee_id) index only ever catches one
  // direction of a duplicate pair, so the mirrored pair is checked here in
  // the service layer.
  private async findExistingEitherDirection(
    userIdA: string,
    userIdB: string,
  ): Promise<Friendship | null> {
    return this.friendships.findOne({
      where: [
        { requesterId: userIdA, addresseeId: userIdB },
        { requesterId: userIdB, addresseeId: userIdA },
      ],
    });
  }

  async sendRequest(
    requesterId: string,
    addresseeId: string,
  ): Promise<Friendship> {
    if (requesterId === addresseeId) {
      throw new BadRequestException('Cannot send a friend request to yourself');
    }

    const existing = await this.findExistingEitherDirection(
      requesterId,
      addresseeId,
    );
    if (existing) {
      throw new ConflictException(
        'A friendship or pending request already exists between these users',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Friendship);
      const friendship = await repo.save(
        repo.create({ requesterId, addresseeId }),
      );
      await this.notificationsService.createNotification(
        manager,
        addresseeId,
        NotificationType.FRIEND_REQUEST_RECEIVED,
        friendship.id,
      );
      return friendship;
    });
  }

  async accept(
    friendshipId: string,
    actingUserId: string,
  ): Promise<Friendship> {
    const friendship = await this.friendships.findOne({
      where: { id: friendshipId },
    });
    if (!friendship) {
      throw new NotFoundException('Friend request not found');
    }
    if (friendship.addresseeId !== actingUserId) {
      throw new ForbiddenException(
        'Only the addressee can accept a friend request',
      );
    }

    friendship.status = FriendshipStatus.ACTIVE;
    friendship.respondedAt = new Date();
    return this.friendships.save(friendship);
  }

  // Handles both Decline (addressee removes a PENDING request) and Unadd
  // (either party removes an ACTIVE friendship, unilaterally) -- Foundation
  // §12 describes both as "removes it", differing only in who may act and
  // on what status.
  async remove(friendshipId: string, actingUserId: string): Promise<void> {
    const friendship = await this.friendships.findOne({
      where: { id: friendshipId },
    });
    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    const isParty =
      friendship.requesterId === actingUserId ||
      friendship.addresseeId === actingUserId;
    if (!isParty) {
      throw new ForbiddenException('Not a party to this friendship');
    }
    if (
      friendship.status === FriendshipStatus.PENDING &&
      friendship.addresseeId !== actingUserId
    ) {
      throw new ForbiddenException(
        'Only the addressee can decline a pending friend request',
      );
    }

    await this.friendships.delete(friendship.id);
  }

  // Joined with `users` for the requester's email/display name -- Foundation
  // §12's "Pending Friend Requests view" needs to show *who* is requesting,
  // not just a friendship id, and there is no separate user-lookup endpoint
  // this UI could otherwise call (BL-041's directory search is Epic 9).
  async listPendingForUser(userId: string): Promise<PendingFriendRequest[]> {
    return this.friendships.manager.query(
      `SELECT f.id, f.requester_id AS "requesterId",
              u.email AS "requesterEmail", u.display_name AS "requesterDisplayName",
              f.created_at AS "createdAt"
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
        WHERE f.addressee_id = $1 AND f.status = 'PENDING'
        ORDER BY f.created_at DESC`,
      [userId],
    );
  }

  // The friend-gating check BL-x09/x10 need: is there an ACTIVE friendship
  // between the two users, in either direction? Callers decide separately
  // whether "viewing your own profile" should also count -- this method is
  // purely about the friendships table.
  async areFriends(userIdA: string, userIdB: string): Promise<boolean> {
    const existing = await this.friendships.findOne({
      where: [
        {
          requesterId: userIdA,
          addresseeId: userIdB,
          status: FriendshipStatus.ACTIVE,
        },
        {
          requesterId: userIdB,
          addresseeId: userIdA,
          status: FriendshipStatus.ACTIVE,
        },
      ],
    });
    return !!existing;
  }
}
