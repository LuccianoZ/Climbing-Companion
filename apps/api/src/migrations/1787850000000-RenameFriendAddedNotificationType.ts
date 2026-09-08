import { MigrationInterface, QueryRunner } from 'typeorm';

// Foundation Revision Sept 7 2026 -- Part 2 (AR-55), BL-040/044: friendship
// becomes invite-link-based, so there is no "friend request received"
// event any more. The notification that fires when someone redeems your
// invite link goes to *you*, the link's author, and is named FRIEND_ADDED.
//
// `ALTER TYPE ... RENAME VALUE` is a catalog-only rename on PostgreSQL 10+
// (no table rewrite, no lock beyond the type) and is fully transactional --
// unlike `ADD VALUE`, it may run alongside other DDL. Any existing
// FRIEND_REQUEST_RECEIVED rows (only ever written by the retired BL-x11
// request path) carry straight over under the new label, which is the
// correct behaviour: they were "a friendship formed" notifications too.
export class RenameFriendAddedNotificationType1787850000000 implements MigrationInterface {
  name = 'RenameFriendAddedNotificationType1787850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type" RENAME VALUE 'FRIEND_REQUEST_RECEIVED' TO 'FRIEND_ADDED';`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type" RENAME VALUE 'FRIEND_ADDED' TO 'FRIEND_REQUEST_RECEIVED';`,
    );
  }
}
