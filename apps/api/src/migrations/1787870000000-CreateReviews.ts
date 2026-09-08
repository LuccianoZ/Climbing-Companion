import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §7 `reviews` + the `review_target_type` enum. Epic 9,
// BL-045: a review can be left on any crag, route, or gym regardless of
// its lifecycle status (Foundation §12) -- there is deliberately no
// status filter and no 300m gate (unlike grade votes and climb logs).
//
// Mandatory text <= 250 chars (the §12 user-content ceiling), optional
// photo. The photo is a normal REVIEW_PHOTO media_asset that enters the
// §10 pending queue like any community upload; `media_asset_id` here is
// nullable and points at it once uploaded.
//
// Exactly one of the three target FKs is non-null, matching `target_type`
// -- enforced by a CHECK so a malformed row can never reach the table
// even if a caller bypasses the service.
export class CreateReviews1787870000000 implements MigrationInterface {
  name = 'CreateReviews1787870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "review_target_type" AS ENUM ('CRAG', 'ROUTE', 'GYM');
    `);

    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "target_type" "review_target_type" NOT NULL,
        "target_crag_id" uuid,
        "target_route_id" uuid,
        "target_gym_id" uuid,
        "author_id" uuid NOT NULL,
        "body" varchar(250) NOT NULL,
        "media_asset_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reviews_target_crag_id" FOREIGN KEY ("target_crag_id") REFERENCES "crags" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_target_route_id" FOREIGN KEY ("target_route_id") REFERENCES "routes" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_target_gym_id" FOREIGN KEY ("target_gym_id") REFERENCES "gyms" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_author_id" FOREIGN KEY ("author_id") REFERENCES "users" ("id"),
        CONSTRAINT "FK_reviews_media_asset_id" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_reviews_one_target" CHECK (
          (target_type = 'CRAG'  AND target_crag_id  IS NOT NULL AND target_route_id IS NULL AND target_gym_id   IS NULL) OR
          (target_type = 'ROUTE' AND target_route_id IS NOT NULL AND target_crag_id  IS NULL AND target_gym_id   IS NULL) OR
          (target_type = 'GYM'   AND target_gym_id   IS NOT NULL AND target_crag_id  IS NULL AND target_route_id IS NULL)
        )
      );
    `);

    // Architecture §8: a target's review list is the only read path.
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_target_crag_id" ON "reviews" ("target_crag_id") WHERE "target_crag_id" IS NOT NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_target_route_id" ON "reviews" ("target_route_id") WHERE "target_route_id" IS NOT NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_target_gym_id" ON "reviews" ("target_gym_id") WHERE "target_gym_id" IS NOT NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reviews";`);
    await queryRunner.query(`DROP TYPE "review_target_type";`);
  }
}
