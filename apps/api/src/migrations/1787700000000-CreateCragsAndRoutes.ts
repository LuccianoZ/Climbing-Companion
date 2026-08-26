import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §3 `crags`/`routes` plus the three new §1 enums they need
// (lifecycle_status, outdoor_discipline, gear_requirement). BL-006 / AR-2:
// crags and routes have a circular FK (crags.founding_route_id ->
// routes.id, routes.crag_id -> crags.id), so crags is created first without
// that FK, then routes, then the FK is added afterwards via ALTER TABLE.
export class CreateCragsAndRoutes1787700000000 implements MigrationInterface {
  name = 'CreateCragsAndRoutes1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sprint 1 Day 1 infra bootstrap already ran `CREATE EXTENSION
    // postgis;` against the postgis/postgis container (Backlog.md), but
    // this is the first migration to actually depend on it -- IF NOT
    // EXISTS keeps this migration correct standalone against any
    // freshly-provisioned database too, not just the one bootstrap already
    // touched.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);

    await queryRunner.query(`
      CREATE TYPE "lifecycle_status" AS ENUM ('UNVERIFIED', 'VERIFIED', 'ARCHIVED');
    `);
    await queryRunner.query(`
      CREATE TYPE "outdoor_discipline" AS ENUM ('SPORT_CLIMBING', 'BOULDERING', 'TRADITIONAL_CLIMBING');
    `);
    await queryRunner.query(`
      CREATE TYPE "gear_requirement" AS ENUM ('QUICKDRAWS', 'CRASH_PAD', 'TRAD_GEAR', 'HELMET');
    `);

    // `founding_route_id` has no FK yet -- `routes` doesn't exist until the
    // next statement below (AR-2).
    await queryRunner.query(`
      CREATE TABLE "crags" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(100) NOT NULL,
        "location" geography(Point,4326) NOT NULL,
        "status" "lifecycle_status" NOT NULL DEFAULT 'UNVERIFIED',
        "founding_route_id" uuid,
        "created_by" uuid NOT NULL,
        "verified_at" timestamptz,
        "archived_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_crags_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_crags_founding_route_id" UNIQUE ("founding_route_id"),
        CONSTRAINT "FK_crags_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_crags_location" ON "crags" USING GIST ("location");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_crags_status" ON "crags" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE "routes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "crag_id" uuid NOT NULL,
        "name" varchar(100) NOT NULL,
        "location" geography(Point,4326) NOT NULL,
        "discipline" "outdoor_discipline" NOT NULL,
        "gear_requirements" "gear_requirement"[] NOT NULL DEFAULT '{}',
        "summary" varchar(250) NOT NULL,
        "proposed_grade_ordinal" smallint NOT NULL,
        "bolt_count" smallint,
        "min_rope_length_m" smallint,
        "status" "lifecycle_status" NOT NULL DEFAULT 'UNVERIFIED',
        "submitted_by" uuid NOT NULL,
        "verified_at" timestamptz,
        "archived_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_routes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_routes_crag_id" FOREIGN KEY ("crag_id") REFERENCES "crags" ("id"),
        CONSTRAINT "FK_routes_submitted_by" FOREIGN KEY ("submitted_by") REFERENCES "users" ("id"),
        CONSTRAINT "CHK_routes_bouldering_no_bolt_rope" CHECK (
          "discipline" <> 'BOULDERING' OR ("bolt_count" IS NULL AND "min_rope_length_m" IS NULL)
        )
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_routes_location" ON "routes" USING GIST ("location");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_routes_crag_id" ON "routes" ("crag_id");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_routes_unverified_created_at" ON "routes" ("created_at") WHERE "status" = 'UNVERIFIED';
    `);

    // Back-fill the circular FK now that `routes` exists (AR-2).
    await queryRunner.query(`
      ALTER TABLE "crags"
      ADD CONSTRAINT "FK_crags_founding_route_id" FOREIGN KEY ("founding_route_id") REFERENCES "routes" ("id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crags" DROP CONSTRAINT "FK_crags_founding_route_id";`,
    );
    await queryRunner.query(`DROP TABLE "routes";`);
    await queryRunner.query(`DROP TABLE "crags";`);
    await queryRunner.query(`DROP TYPE "gear_requirement";`);
    await queryRunner.query(`DROP TYPE "outdoor_discipline";`);
    await queryRunner.query(`DROP TYPE "lifecycle_status";`);
    // postgis extension deliberately left in place on down, same rationale
    // as citext in CreateUsers's down -- gyms (BL-007) will depend on it
    // too, and DROP EXTENSION isn't safely reversible once anything else
    // uses it.
  }
}
