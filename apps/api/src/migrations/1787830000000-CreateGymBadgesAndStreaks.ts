import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §5 `gym_badges` / `gym_streaks`, AR-53 (Sept 7, 2026).
// Replaces the never-implemented `gym_grade_tiers` (cut before
// implementation, AR-39) as BL-038's indoor-analytics table.
//
// `gym_badges.gym_id` is nullable with ON DELETE SET NULL -- the one
// deliberate departure from AR-52's hard-delete cascade convention, because
// a badge must survive its gym being hard-deleted (Foundation §8's
// "permanent" requirement). The badge instead snapshots the gym's name and
// initials at mint time, so it renders correctly even after `gym_id` goes
// null. `gym_streaks` carries no such requirement -- plain ON DELETE
// CASCADE, since a deleted gym can no longer be checked into and the streak
// has no permanence guarantee.
export class CreateGymBadgesAndStreaks1787830000000 implements MigrationInterface {
  name = 'CreateGymBadgesAndStreaks1787830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gym_badges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "gym_id" uuid NULL,
        "gym_name_snapshot" varchar(120) NOT NULL,
        "gym_initials_snapshot" varchar(8) NOT NULL,
        "earned_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gym_badges_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_gym_badges_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id"),
        CONSTRAINT "FK_gym_badges_gym_id" FOREIGN KEY ("gym_id") REFERENCES "gyms" ("id") ON DELETE SET NULL
      );
    `);

    // Partial unique: one badge per user per gym while the gym still
    // exists. A null gym_id only occurs post-hard-delete, when a second
    // badge for the same now-gone gym can no longer happen anyway.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_gym_badges_user_id_gym_id" ON "gym_badges" ("user_id", "gym_id") WHERE "gym_id" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_gym_badges_user_id" ON "gym_badges" ("user_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "gym_streaks" (
        "user_id" uuid NOT NULL,
        "gym_id" uuid NOT NULL,
        "current_streak_months" smallint NOT NULL DEFAULT 0,
        "last_counted_period" smallint NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gym_streaks_user_id_gym_id" PRIMARY KEY ("user_id", "gym_id"),
        CONSTRAINT "FK_gym_streaks_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_gym_streaks_gym_id" FOREIGN KEY ("gym_id") REFERENCES "gyms" ("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gym_streaks";`);
    await queryRunner.query(`DROP TABLE "gym_badges";`);
  }
}
