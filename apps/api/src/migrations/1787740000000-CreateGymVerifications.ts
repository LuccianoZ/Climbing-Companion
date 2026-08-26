import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §4 `gym_verifications`. BL-011. No new enum needed --
// disciplines_submitted reuses the existing `gym_discipline` enum created
// by CreateGyms1787710000000 for `gyms.disciplines_offered`.
export class CreateGymVerifications1787740000000 implements MigrationInterface {
  name = 'CreateGymVerifications1787740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gym_verifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "gym_id" uuid NOT NULL,
        "verifier_user_id" uuid NOT NULL,
        "media_asset_id" uuid NOT NULL,
        "disciplines_submitted" "gym_discipline"[] NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gym_verifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_gym_verifications_verifier_gym" UNIQUE ("verifier_user_id", "gym_id"),
        CONSTRAINT "FK_gym_verifications_gym_id" FOREIGN KEY ("gym_id") REFERENCES "gyms" ("id"),
        CONSTRAINT "FK_gym_verifications_verifier_user_id" FOREIGN KEY ("verifier_user_id") REFERENCES "users" ("id"),
        CONSTRAINT "FK_gym_verifications_media_asset_id" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id")
      );
    `);

    // Backs the "how many verifications does this gym have" COUNT(*) check
    // VerificationService re-runs on every write (Architecture §4), same
    // pattern as IDX_route_verifications_route_id.
    await queryRunner.query(`
      CREATE INDEX "IDX_gym_verifications_gym_id" ON "gym_verifications" ("gym_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gym_verifications";`);
  }
}
