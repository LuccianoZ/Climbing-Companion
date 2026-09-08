import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Friendship, FriendshipStatus } from './entities/friendship.entity';

export interface FriendSummary {
  friendshipId: string;
  userId: string;
  email: string;
  displayName: string;
  since: string;
}

export interface CreateActiveFriendshipResult {
  friendship: Friendship;
  alreadyExisted: boolean;
}

// Architecture.md §7 `friendships`. Originally the request/accept/decline
// slice (BL-x11, AR-53); reworked to invite-link friendship in AR-55
// (Sept 7, 2026 -- Part 2). What survives: `remove` (unadd, unilateral),
// `areFriends` (the badge/streak visibility gate), and the AR-5
// mirrored-pair check -- now used by `createActiveFriendship`, the method
// FriendInviteLinksService.redeem calls to write the row. Gone:
// `sendRequest`, `accept`, `listPendingForUser` -- there is no pending
// state any more.
@Injectable()
export class FriendshipsService {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendships: Repository<Friendship>,
  ) {}

  // AR-5: a UNIQUE (requester_id, addressee_id) index only ever catches one
  // direction of a duplicate pair, so the mirrored pair is checked in the
  // service layer. Runs against a caller-supplied EntityManager when given
  // one, so the check and the insert that follows it share a transaction.
  private async findExistingEitherDirection(
    userIdA: string,
    userIdB: string,
    manager?: EntityManager,
  ): Promise<Friendship | null> {
    const repo = manager ? manager.getRepository(Friendship) : this.friendships;
    return repo.findOne({
      where: [
        { requesterId: userIdA, addresseeId: userIdB },
        { requesterId: userIdB, addresseeId: userIdA },
      ],
    });
  }

  // Called by FriendInviteLinksService.redeem inside its transaction.
  // `requesterId` is the invite link's creator, `addresseeId` the redeemer
  // (AR-55). Idempotent: if the two are already connected in either
  // direction, the existing row is returned untouched and `alreadyExisted`
  // is true, so the caller can consume the link without writing a second
  // friendship.
  async createActiveFriendship(
    manager: EntityManager,
    requesterId: string,
    addresseeId: string,
  ): Promise<CreateActiveFriendshipResult> {
    const existing = await this.findExistingEitherDirection(
      requesterId,
      addresseeId,
      manager,
    );
    if (existing) {
      return { friendship: existing, alreadyExisted: true };
    }

    const repo = manager.getRepository(Friendship);
    const friendship = await repo.save(
      repo.create({
        requesterId,
        addresseeId,
        status: FriendshipStatus.ACTIVE,
        respondedAt: new Date(),
      }),
    );
    return { friendship, alreadyExisted: false };
  }

  // Unadd: unilateral, either party, on an ACTIVE friendship. There is no
  // "decline" case any more (nothing is ever PENDING), so this is now a
  // plain "you are a party to it -> you may delete it" check.
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

    await this.friendships.delete(friendship.id);
  }

  // The friend-gating check BL-x09/x10 need: is there an ACTIVE friendship
  // between the two users, in either direction? Callers decide separately
  // whether "viewing your own profile" should also count.
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

  // The caller's accepted friends, either direction, joined with `users`
  // for a display name / email. Backs the "Your friends" list in Profile
  // (BL-041) -- with no user directory, this list plus the unadd action is
  // the whole of the friend-management surface.
  async listFriendsForUser(userId: string): Promise<FriendSummary[]> {
    return this.friendships.manager.query(
      `SELECT f.id AS "friendshipId",
              u.id AS "userId",
              u.email AS "email",
              u.display_name AS "displayName",
              COALESCE(f.responded_at, f.created_at) AS "since"
         FROM friendships f
         JOIN users u
           ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id
                          ELSE f.requester_id END
        WHERE f.status = 'ACTIVE'
          AND (f.requester_id = $1 OR f.addressee_id = $1)
        ORDER BY "since" DESC`,
      [userId],
    );
  }
}
