import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §5 `climb_logs`. BL-017/BL-018. New enum `climb_outcome`
// (COMPLETED, ATTEMPTED). No uniqueness constraint on this table --
// repeats across visits are expected (§7) -- so unlike route_grade_votes
// this has a plain generated uuid PK, not a composite one.
export class CreateClimbLogs1787750000000 implements MigrationInterface {
  name = 'CreateClimbLogs1787750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "climb_outcome" AS ENUM ('COMPLETED', 'ATTEMPTED');
    `);

    await queryRunner.query(`
      CREATE TABLE "climb_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "route_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "outcome" "climb_outcome" NOT NULL,
        "grade_snapshot_ordinal" smallint NOT NULL,
        "logged_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_climb_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_climb_logs_route_id" FOREIGN KEY ("route_id") REFERENCES "routes" ("id"),
        CONSTRAINT "FK_climb_logs_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id")
      );
    `);

    // (user_id, outcome) backs the Sprint 3 analytics split by
    // discipline/outcome (§12, BL-036/037); (route_id) backs any future
    // per-route log listing.
    await queryRunner.query(`
      CREATE INDEX "IDX_climb_logs_user_id_outcome" ON "climb_logs" ("user_id", "outcome");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_climb_logs_route_id" ON "climb_logs" ("route_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "climb_logs";`);
    await queryRunner.query(`DROP TYPE "climb_outcome";`);
  }
}
