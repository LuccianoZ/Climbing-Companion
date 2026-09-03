import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §7 `notifications` + the `notification_type` enum.
//
// Ownership note (AR-43): Architecture §7 and Backlog.md file this table
// under Epic 7's messaging/notifications work (BL-042-044). Epic 6 pulls it
// forward because BL-028's photo rejection and strike both raise an in-app
// alert (Foundation §12: "image rejected, strike issued"), and there is
// nowhere to write that alert without this table. Epic 7 still owns the
// unified poll endpoint (§19.2, PollService.getUpdatesSince) and the
// `direct_messages` / `conversations` half of that surface -- only the
// `notifications` table itself moves up.
//
// There is deliberately no `read_at` column: Foundation §12 / §19.2 model
// "unread" as client-side state driven by `last_checked_timestamp`, not a
// server flag. The Alerts screen's "Mark All Read" is a local timestamp
// bump (AR-44).
export class CreateNotifications1787780000000 implements MigrationInterface {
  name = 'CreateNotifications1787780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notification_type" AS ENUM ('FRIEND_REQUEST_RECEIVED', 'IMAGE_REJECTED', 'STRIKE_ISSUED');
    `);

    // `related_entity_id` is a loose UUID with no FK (Architecture AR-6) --
    // it points at a friendships / media_assets / user_accountability_actions
    // row depending on `type`. Epic 6 only ever writes IMAGE_REJECTED (points
    // at the media_moderation_actions row) and STRIKE_ISSUED (points at the
    // user_accountability_actions row).
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "recipient_user_id" uuid NOT NULL,
        "type" "notification_type" NOT NULL,
        "related_entity_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_recipient_user_id" FOREIGN KEY ("recipient_user_id") REFERENCES "users" ("id")
      );
    `);

    // Mandatory index (Architecture §8, §19.2): the poll endpoint scans
    // "my notifications, newest first, created after <timestamp>".
    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_recipient_created" ON "notifications" ("recipient_user_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notifications";`);
    await queryRunner.query(`DROP TYPE "notification_type";`);
  }
}
