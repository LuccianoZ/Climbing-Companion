import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §6 `media_reports` / `media_moderation_actions` /
// `user_accountability_actions`, plus the three enums they need. Epic 6
// (Sprint 3, BL-027/028/029/030).
//
// `users.strike_count` / `users.is_banned` / `users.banned_at` are NOT
// touched here -- they already exist, created by CreateUsers (BL-001), so
// BL-028's accountability side effects (Architecture §6: "updates
// users.strike_count / users.is_banned in the same transaction") have
// somewhere to write without a schema change. See AR-41.
//
// `notifications` is its own migration (CreateNotifications, next) -- it is
// conceptually Epic 7 territory pulled forward for BL-028's in-app alerts,
// and keeping it separate keeps this migration's `down` a clean drop of
// exactly the moderation tables.
export class CreateModerationTables1787770000000 implements MigrationInterface {
  name = 'CreateModerationTables1787770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "moderation_decision" AS ENUM ('APPROVE', 'REJECT');
    `);
    await queryRunner.query(`
      CREATE TYPE "accountability_action" AS ENUM ('ISSUE_STRIKE', 'REVOKE_STRIKE', 'BAN_OUTRIGHT', 'RESTORE_ACCOUNT');
    `);
    await queryRunner.query(`
      CREATE TYPE "moderation_reason_preset" AS ENUM ('OFF_TOPIC', 'LOW_IMAGE_QUALITY', 'INAPPROPRIATE_EXPLICIT', 'SUSPECTED_FRAUDULENT', 'OTHER');
    `);

    // Community reports (§10.3). `reason` is nullable -- a community report
    // is not the mandatory-reason mechanism (that is §11, admin-only). A
    // report flips the target asset back to PENDING; that mutation is done
    // by the service, not a trigger, so it stays visible to Cucumber.
    await queryRunner.query(`
      CREATE TABLE "media_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "media_asset_id" uuid NOT NULL,
        "reported_by" uuid NOT NULL,
        "reason" varchar(250),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_media_reports_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_media_reports_media_asset_id" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id"),
        CONSTRAINT "FK_media_reports_reported_by" FOREIGN KEY ("reported_by") REFERENCES "users" ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_media_reports_media_asset_id" ON "media_reports" ("media_asset_id");
    `);

    // The admin's Approve / Reject record for a single media asset (§6, §14).
    // `reason_preset` / `reason_text` are both nullable at the DB level:
    // Approve carries no reason, and a bare Reject of an ordinary asset with
    // no paired strike/ban does not require one either (Foundation §10 --
    // "Reject (purges, no strike)" names no reason). The service enforces
    // the "reason mandatory" branch (verification-photo rejection, or Reject
    // paired with a strike/ban) -- see AR-42.
    await queryRunner.query(`
      CREATE TABLE "media_moderation_actions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "media_asset_id" uuid NOT NULL,
        "admin_user_id" uuid NOT NULL,
        "decision" "moderation_decision" NOT NULL,
        "reason_preset" "moderation_reason_preset",
        "reason_text" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_media_moderation_actions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_media_moderation_actions_media_asset_id" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id"),
        CONSTRAINT "FK_media_moderation_actions_admin_user_id" FOREIGN KEY ("admin_user_id") REFERENCES "users" ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_media_moderation_actions_media_asset_id" ON "media_moderation_actions" ("media_asset_id");
    `);

    // The four §11 accountability actions. `reason_text` is NOT NULL here --
    // "Every action below requires a mandatory reason" (Foundation §11),
    // unconditionally, for all four. `triggering_media_action_id` links a
    // strike/ban back to the photo rejection that caused it (AR-1), and is
    // null for a standalone admin-dashboard action (Epic 7).
    await queryRunner.query(`
      CREATE TABLE "user_accountability_actions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "target_user_id" uuid NOT NULL,
        "admin_user_id" uuid NOT NULL,
        "action_type" "accountability_action" NOT NULL,
        "reason_preset" "moderation_reason_preset",
        "reason_text" varchar(500) NOT NULL,
        "triggering_media_action_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_accountability_actions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_accountability_actions_target_user_id" FOREIGN KEY ("target_user_id") REFERENCES "users" ("id"),
        CONSTRAINT "FK_user_accountability_actions_admin_user_id" FOREIGN KEY ("admin_user_id") REFERENCES "users" ("id"),
        CONSTRAINT "FK_user_accountability_actions_triggering_media_action_id" FOREIGN KEY ("triggering_media_action_id") REFERENCES "media_moderation_actions" ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_user_accountability_actions_target_created" ON "user_accountability_actions" ("target_user_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_accountability_actions";`);
    await queryRunner.query(`DROP TABLE "media_moderation_actions";`);
    await queryRunner.query(`DROP TABLE "media_reports";`);
    await queryRunner.query(`DROP TYPE "moderation_reason_preset";`);
    await queryRunner.query(`DROP TYPE "accountability_action";`);
    await queryRunner.query(`DROP TYPE "moderation_decision";`);
  }
}
