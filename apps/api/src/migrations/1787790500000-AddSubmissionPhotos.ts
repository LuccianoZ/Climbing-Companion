import { MigrationInterface, QueryRunner } from 'typeorm';

// Foundation Revision Sept 3 2026 (AR-51), BL-x04/BL-x05: every gym and
// outdoor-climb submission now carries >= 3 photos, uploaded through the
// existing BL-008 media gateway and then linked to the entity they belong
// to. Two new `media_purpose` values distinguish these from verification
// photos; two nullable subject FKs on `media_assets` carry the link (chosen
// over per-entity join tables so every image stays in the one table --
// Foundation/Architecture §19.1). A community submission's photos stay
// PENDING (the "Photos pending admin approval" panel state = zero APPROVED
// rows for the subject); an admin-authored submission's photos are inserted
// APPROVED by the service.
//
// `ALTER TYPE ... ADD VALUE` runs fine inside the migration transaction on
// PostgreSQL 12+ (the `postgis/postgis` image is far newer) as long as the
// new label isn't *used* in the same transaction -- it isn't; the service
// code that references it ships separately.
export class AddSubmissionPhotos1787790500000 implements MigrationInterface {
  name = 'AddSubmissionPhotos1787790500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "media_purpose" ADD VALUE IF NOT EXISTS 'ROUTE_SUBMISSION_PHOTO';`,
    );
    await queryRunner.query(
      `ALTER TYPE "media_purpose" ADD VALUE IF NOT EXISTS 'GYM_SUBMISSION_PHOTO';`,
    );

    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD COLUMN "subject_route_id" uuid;`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD COLUMN "subject_gym_id" uuid;`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD CONSTRAINT "FK_media_assets_subject_route_id" FOREIGN KEY ("subject_route_id") REFERENCES "routes" ("id");`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD CONSTRAINT "FK_media_assets_subject_gym_id" FOREIGN KEY ("subject_gym_id") REFERENCES "gyms" ("id");`,
    );

    // The detail-panel gallery read and the "any APPROVED photo yet?" check
    // only ever filter on one subject id at a time -- partial indexes keep
    // them off the full table (same pattern as IDX_media_assets_pending_*).
    await queryRunner.query(
      `CREATE INDEX "IDX_media_assets_subject_route_id" ON "media_assets" ("subject_route_id") WHERE "subject_route_id" IS NOT NULL;`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_media_assets_subject_gym_id" ON "media_assets" ("subject_gym_id") WHERE "subject_gym_id" IS NOT NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_media_assets_subject_gym_id";`);
    await queryRunner.query(`DROP INDEX "IDX_media_assets_subject_route_id";`);
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT "FK_media_assets_subject_gym_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT "FK_media_assets_subject_route_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP COLUMN "subject_gym_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP COLUMN "subject_route_id";`,
    );

    // Postgres has no `DROP VALUE` for an enum, so rebuild the type without
    // the two new labels and re-point the one column that uses it. This
    // fails (by design) if any row still carries a *_SUBMISSION_PHOTO value
    // -- a genuine data conflict, not something to paper over, exactly as
    // WidenMediaByteSizeCap's down() treats a shrunk byte cap.
    await queryRunner.query(
      `ALTER TYPE "media_purpose" RENAME TO "media_purpose_old";`,
    );
    await queryRunner.query(
      `CREATE TYPE "media_purpose" AS ENUM ('PROFILE_PHOTO', 'ROUTE_VERIFICATION_PHOTO', 'GYM_VERIFICATION_PHOTO', 'REVIEW_PHOTO');`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ALTER COLUMN "purpose" TYPE "media_purpose" USING "purpose"::text::"media_purpose";`,
    );
    await queryRunner.query(`DROP TYPE "media_purpose_old";`);
  }
}
