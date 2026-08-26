import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §3 `gyms` plus the `gym_discipline` enum it needs. BL-007.
// Unlike CreateCragsAndRoutes, no circular FK here -- a gym is a standalone
// pin with no crag/route relationship at all (Foundation §4).
export class CreateGyms1787710000000 implements MigrationInterface {
  name = 'CreateGyms1787710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "gym_discipline" AS ENUM ('AUTO_BELAY', 'TOP_ROPE', 'LEAD', 'BOULDERING', 'SPEED_CLIMBING');
    `);

    await queryRunner.query(`
      CREATE TABLE "gyms" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "location" geography(Point,4326) NOT NULL,
        "status" "lifecycle_status" NOT NULL DEFAULT 'UNVERIFIED',
        "disciplines_offered" "gym_discipline"[] NOT NULL DEFAULT '{}',
        "submitted_by" uuid NOT NULL,
        "verified_directly_by_admin" boolean NOT NULL DEFAULT false,
        "verified_at" timestamptz,
        "archived_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gyms_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_gyms_submitted_by" FOREIGN KEY ("submitted_by") REFERENCES "users" ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_gyms_location" ON "gyms" USING GIST ("location");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_gyms_unverified_created_at" ON "gyms" ("created_at") WHERE "status" = 'UNVERIFIED';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gyms";`);
    await queryRunner.query(`DROP TYPE "gym_discipline";`);
    // postgis/lifecycle_status left in place, same rationale as prior
    // migrations -- both are shared with crags/routes and DROP isn't safely
    // reversible once anything else depends on them.
  }
}
