import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendshipsService } from '../friendships/friendships.service';
import { FriendInviteLink } from './entities/friend-invite-link.entity';

// Foundation §12 / Architecture §7 / AR-55 (Sept 7, 2026 -- Part 2): the
// invite link's 7-day life. Kept here beside the redemption rules rather
// than as a DB default so the whole "is this link still good?" decision
// lives in one place.
export const INVITE_LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreatedInviteLink {
  token: string;
  url: string;
  expiresAt: string;
}

export type RedeemOutcome = 'FRIENDED' | 'ALREADY_FRIENDS';

export interface RedeemResult {
  outcome: RedeemOutcome;
  friendshipId: string;
  friendUserId: string;
}

@Injectable()
export class FriendInviteLinksService {
  constructor(
    @InjectRepository(FriendInviteLink)
    private readonly links: Repository<FriendInviteLink>,
    private readonly friendshipsService: FriendshipsService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private baseUrl(): string {
    return this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
  }

  // Mints a fresh single-use link for `creatorId`. Each call is a new link
  // -- a climber inviting three people generates three tokens. base64url of
  // 32 random bytes is 43 chars of ~256-bit entropy: not guessable, and the
  // whole of what the URL needs to carry.
  async create(creatorId: string): Promise<CreatedInviteLink> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_LINK_LIFETIME_MS);
    await this.links.save(
      this.links.create({
        token,
        creatorId,
        expiresAt,
        consumedAt: null,
        consumedById: null,
      }),
    );
    return {
      token,
      url: `${this.baseUrl()}/friends/invite/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // The first valid redemption makes `redeemerId` and the link's creator
  // friends. All checks and the two writes (friendship row + link consumed
  // + notification) run in one transaction, with the link row locked
  // FOR UPDATE so two simultaneous redemptions can't both pass the
  // single-use check.
  //
  //   404 -> no such token
  //   410 -> already consumed, or past its 7-day expiry
  //   400 -> you are trying to redeem your own link
  //   200 -> friended, or (idempotently) already friends
  async redeem(token: string, redeemerId: string): Promise<RedeemResult> {
    return this.dataSource.transaction(async (manager) => {
      const linkRepo = manager.getRepository(FriendInviteLink);
      const link = await linkRepo.findOne({
        where: { token },
        lock: { mode: 'pessimistic_write' },
      });

      if (!link) {
        throw new NotFoundException('This invite link is not valid.');
      }
      if (link.consumedAt !== null) {
        throw new GoneException('This invite link has already been used.');
      }
      if (link.expiresAt.getTime() <= Date.now()) {
        throw new GoneException('This invite link has expired.');
      }
      if (link.creatorId === redeemerId) {
        throw new BadRequestException('You cannot use your own invite link.');
      }

      const { friendship, alreadyExisted } =
        await this.friendshipsService.createActiveFriendship(
          manager,
          link.creatorId,
          redeemerId,
        );

      link.consumedAt = new Date();
      link.consumedById = redeemerId;
      await linkRepo.save(link);

      // The redeemer took the visible action; the creator is the one who
      // needs telling their link landed. Skipped when they were already
      // friends -- no state actually changed.
      if (!alreadyExisted) {
        await this.notificationsService.createNotification(
          manager,
          link.creatorId,
          NotificationType.FRIEND_ADDED,
          friendship.id,
        );
      }

      return {
        outcome: alreadyExisted ? 'ALREADY_FRIENDS' : 'FRIENDED',
        friendshipId: friendship.id,
        friendUserId: link.creatorId,
      };
    });
  }
}
