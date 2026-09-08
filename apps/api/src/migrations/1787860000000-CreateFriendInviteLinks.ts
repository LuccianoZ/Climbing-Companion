import { MigrationInterface, QueryRunner } from 'typeorm';

// Foundation Revision Sept 7 2026 -- Part 2 (AR-55), BL-040/041: friendship
// is now invite-link-based. A climber mints a single-use link (7-day
// expiry) and sends it out-of-band; the first valid redemption inserts the
// `friendships` row directly ACTIVE. There is no request/accept flow any
// more -- see friendships.service.ts for the retired methods.
//
// Two changes here:
//   1. `friendships.status` default flips PENDING -> ACTIVE. A row is now
//      only ever created by FriendInviteLinksService.redeem, which writes
//      it ACTIVE outright. The PENDING enum value is kept (this migration
//      does not touch the type) purely for reversibility.
//   2. New `friend_invite_links` table. `token` is the only secret in the
//      URL (base64url of 32 random bytes, generated in the service).
//      `expires_at` is set by the service (created_at + 7 days), not a DB
//      default, so the window lives in one place with the rest of the
//      redemption rules.
export class CreateFriendInviteLinks1787860000000 implements MigrationInterface {
  name = 'CreateFriendInviteLinks1787860000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "friendships" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';`,
    );

    await queryRunner.query(`
      CREATE TABLE "friend_invite_links" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "token" varchar(64) NOT NULL,
        "creator_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "consumed_by_id" uuid,
        CONSTRAINT "PK_friend_invite_links_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_friend_invite_links_token" UNIQUE ("token"),
        CONSTRAINT "FK_friend_invite_links_creator_id" FOREIGN KEY ("creator_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_friend_invite_links_consumed_by_id" FOREIGN KEY ("consumed_by_id") REFERENCES "users" ("id") ON DELETE SET NULL
      );
    `);

    // Architecture §8: token lookup is the redeem path's only query; the
    // creator_id index backs "the links I have created" for the share UI.
    await queryRunner.query(
      `CREATE INDEX "IDX_friend_invite_links_creator_id" ON "friend_invite_links" ("creator_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "friend_invite_links";`);
    await queryRunner.query(
      `ALTER TABLE "friendships" ALTER COLUMN "status" SET DEFAULT 'PENDING';`,
    );
  }
}
