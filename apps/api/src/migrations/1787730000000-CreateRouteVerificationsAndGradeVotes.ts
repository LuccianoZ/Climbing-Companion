import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §4 `route_verifications` / `route_grade_votes`. BL-009.
// No new enums needed -- both tables reuse existing types (route_id/
// verifier_user_id/etc are plain uuid FKs, grade_ordinal is a smallint
// ordinal validated at the DTO layer, same convention as
// routes.proposed_grade_ordinal).
export class CreateRouteVerificationsAndGradeVotes1787730000000 implements MigrationInterface {
  name = 'CreateRouteVerificationsAndGradeVotes1787730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "route_verifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "route_id" uuid NOT NULL,
        "verifier_user_id" uuid NOT NULL,
        "media_asset_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_route_verifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_route_verifications_verifier_route" UNIQUE ("verifier_user_id", "route_id"),
        CONSTRAINT "FK_route_verifications_route_id" FOREIGN KEY ("route_id") REFERENCES "routes" ("id"),
        CONSTRAINT "FK_route_verifications_verifier_user_id" FOREIGN KEY ("verifier_user_id") REFERENCES "users" ("id"),
        CONSTRAINT "FK_route_verifications_media_asset_id" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id")
      );
    `);

    // Backs the "how many verifications does this route have" COUNT(*)
    // check VerificationService re-runs on every write (Architecture §4).
    await queryRunner.query(`
      CREATE INDEX "IDX_route_verifications_route_id" ON "route_verifications" ("route_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "route_grade_votes" (
        "route_id" uuid NOT NULL,
        "voter_user_id" uuid NOT NULL,
        "grade_ordinal" smallint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_route_grade_votes" PRIMARY KEY ("route_id", "voter_user_id"),
        CONSTRAINT "FK_route_grade_votes_route_id" FOREIGN KEY ("route_id") REFERENCES "routes" ("id"),
        CONSTRAINT "FK_route_grade_votes_voter_user_id" FOREIGN KEY ("voter_user_id") REFERENCES "users" ("id")
      );
    `);

    // Backs the future plurality-consensus query (Sprint 2, BL-016) --
    // GROUP BY grade_ordinal per route_id.
    await queryRunner.query(`
      CREATE INDEX "IDX_route_grade_votes_route_id" ON "route_grade_votes" ("route_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "route_grade_votes";`);
    await queryRunner.query(`DROP TABLE "route_verifications";`);
  }
}
