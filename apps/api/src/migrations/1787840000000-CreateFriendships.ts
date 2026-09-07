import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §7 `friendships` + `friendship_status` enum. Pulled
// forward from Epic 9 into Epic 8 (AR-53, Sept 7, 2026, BL-x11) because
// BL-x09/x10's friend-gating needs a friend relation to exist. Only the
// request/accept/decline/unadd slice (BL-039/040) is built now -- the rest
// of the Social Layer (search, DMs, reviews) stays deferred.
//
// UNIQUE (requester_id, addressee_id) catches only one direction of a
// duplicate pair; the mirrored-pair check is a service-layer concern
// (Architecture AR-5), not a DB constraint.
export class CreateFriendships1787840000000 implements MigrationInterface {
  name = 'CreateFriendships1787840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "friendship_status" AS ENUM ('PENDING', 'ACTIVE');
    `);

    await queryRunner.query(`
      CREATE TABLE "friendships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "requester_id" uuid NOT NULL,
        "addressee_id" uuid NOT NULL,
        "status" "friendship_status" NOT NULL DEFAULT 'PENDING',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "responded_at" timestamptz NULL,
        CONSTRAINT "PK_friendships_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_friendships_requester_id" FOREIGN KEY ("requester_id") REFERENCES "users" ("id"),
        CONSTRAINT "FK_friendships_addressee_id" FOREIGN KEY ("addressee_id") REFERENCES "users" ("id"),
        CONSTRAINT "UQ_friendships_requester_addressee" UNIQUE ("requester_id", "addressee_id")
      );
    `);

    // Architecture §8: (addressee_id, status) backs "my pending friend
    // requests"; (requester_id) backs "requests I've sent".
    await queryRunner.query(`
      CREATE INDEX "IDX_friendships_addressee_status" ON "friendships" ("addressee_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_friendships_requester_id" ON "friendships" ("requester_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "friendships";`);
    await queryRunner.query(`DROP TYPE "friendship_status";`);
  }
}
