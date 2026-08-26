import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §6 `media_assets` plus the media_purpose /
// media_moderation_status enums it needs. BL-008. Also resolves the
// forward-reference left on `users` since BL-001 (Architecture §2):
// `profile_photo_media_id` couldn't exist until media_assets did, so it
// lands here as an ALTER TABLE rather than in CreateUsers.
export class CreateMediaAssets1787720000000 implements MigrationInterface {
  name = 'CreateMediaAssets1787720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "media_purpose" AS ENUM ('PROFILE_PHOTO', 'ROUTE_VERIFICATION_PHOTO', 'GYM_VERIFICATION_PHOTO', 'REVIEW_PHOTO');
    `);
    await queryRunner.query(`
      CREATE TYPE "media_moderation_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    `);

    await queryRunner.query(`
      CREATE TABLE "media_assets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_user_id" uuid NOT NULL,
        "purpose" "media_purpose" NOT NULL,
        "payload" bytea NOT NULL,
        "mime_type" varchar(20) NOT NULL,
        "byte_size" integer NOT NULL,
        "moderation_status" "media_moderation_status" NOT NULL DEFAULT 'PENDING',
        "etag" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_media_assets_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_media_assets_owner_user_id" FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id"),
        CONSTRAINT "CHK_media_assets_mime_type" CHECK ("mime_type" IN ('image/jpeg', 'image/png')),
        CONSTRAINT "CHK_media_assets_byte_size" CHECK ("byte_size" <= 2097152)
      );
    `);

    // Foundation §19.1: JPEG/PNG are already compressed, so TOAST's LZ pass
    // on the payload column is wasted CPU -- store it external, uncompressed.
    await queryRunner.query(`
      ALTER TABLE "media_assets" ALTER COLUMN "payload" SET STORAGE EXTERNAL;
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_media_assets_owner_user_id" ON "media_assets" ("owner_user_id");
    `);
    // Partial index backing the Admin Flag Queue's primary scan (§14, §6) --
    // only PENDING rows are ever scanned by it.
    await queryRunner.query(`
      CREATE INDEX "IDX_media_assets_pending_created_at" ON "media_assets" ("created_at") WHERE "moderation_status" = 'PENDING';
    `);

    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "profile_photo_media_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "FK_users_profile_photo_media_id" FOREIGN KEY ("profile_photo_media_id") REFERENCES "media_assets" ("id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_profile_photo_media_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "profile_photo_media_id";`,
    );
    await queryRunner.query(`DROP TABLE "media_assets";`);
    await queryRunner.query(`DROP TYPE "media_moderation_status";`);
    await queryRunner.query(`DROP TYPE "media_purpose";`);
  }
}
