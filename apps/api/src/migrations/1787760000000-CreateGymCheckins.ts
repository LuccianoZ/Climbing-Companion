import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §5 `gym_checkins`. BL-024, Epic 5 (Sprint 3). No new enum
// -- gym_id/user_id are plain uuid FKs and checked_in_at is a timestamptz
// default now(), the same shape as climb_logs. No uniqueness constraint:
// repeated check-ins across different visits are expected, the same
// "repeats expected" convention climb_logs already established (AR-18)
// rather than route_grade_votes' upsert-on-composite-PK shape.
//
// AR-39: `gym_grade_tiers`, originally scoped alongside this table under
// BL-025, was cut from Sprint 3 scope before implementation began -- this
// migration creates gym_checkins only, and there is no sibling migration
// for the tier table anywhere in this repo.
export class CreateGymCheckins1787760000000 implements MigrationInterface {
  name = 'CreateGymCheckins1787760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gym_checkins" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "gym_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "checked_in_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gym_checkins_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_gym_checkins_gym_id" FOREIGN KEY ("gym_id") REFERENCES "gyms" ("id"),
        CONSTRAINT "FK_gym_checkins_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id")
      );
    `);

    // Architecture §5: (user_id, gym_id) backs "has this climber checked in
    // here before" / per-user attendance reads (Sprint 3 analytics, BL-038,
    // if it lands); (gym_id) backs a gym's own attendance count.
    await queryRunner.query(`
      CREATE INDEX "IDX_gym_checkins_user_id_gym_id" ON "gym_checkins" ("user_id", "gym_id");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_gym_checkins_gym_id" ON "gym_checkins" ("gym_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gym_checkins";`);
  }
}
