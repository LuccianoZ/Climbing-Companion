import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §2 `users` table, minus `profile_photo_media_id`
// (deferred to a BL-008 migration once `media_assets` exists -- see the
// comment on the User entity).
export class CreateUsers1787680466480 implements MigrationInterface {
  name = 'CreateUsers1787680466480';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // citext gives case-insensitive email lookups/uniqueness by construction
    // (Architecture §2) instead of LOWER()-wrapping every query.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext;`);

    await queryRunner.query(`
      CREATE TYPE "user_role" AS ENUM ('VERIFIED_USER', 'SYSTEM_ADMIN');
    `);
    await queryRunner.query(`
      CREATE TYPE "grade_display_pref" AS ENUM ('YOSEMITE', 'FRENCH');
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" citext NOT NULL,
        "password_hash" text NOT NULL,
        "display_name" varchar(50) NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'VERIFIED_USER',
        "bio" varchar(250),
        "grade_display_pref" "grade_display_pref" NOT NULL DEFAULT 'YOSEMITE',
        "is_private" boolean NOT NULL DEFAULT false,
        "strike_count" smallint NOT NULL DEFAULT 0,
        "is_banned" boolean NOT NULL DEFAULT false,
        "banned_at" timestamptz,
        "pending_email" citext,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "CHK_users_strike_count_nonneg" CHECK ("strike_count" >= 0)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users";`);
    await queryRunner.query(`DROP TYPE "grade_display_pref";`);
    await queryRunner.query(`DROP TYPE "user_role";`);
    // citext extension deliberately left in place on down -- other tables
    // (e.g. a later `pending_email`-style column) may come to depend on it,
    // and DROP EXTENSION isn't safely reversible once anything else uses it.
  }
}
