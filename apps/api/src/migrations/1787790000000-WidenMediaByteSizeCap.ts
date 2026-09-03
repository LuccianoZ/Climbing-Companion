import { MigrationInterface, QueryRunner } from 'typeorm';

// Product decision (Sept 2 2026): the per-image upload cap goes from 2MB to
// 5MB. `MAX_MEDIA_BYTES` (media-asset.entity.ts) and the multer gateway
// limit are code; this migration moves the DB CHECK constraint to match.
//
// Foundation §19.1 / §10 both still say "2MB" as of this migration -- those
// are project-knowledge docs this repo cannot edit; the repo's FOUNDATION.md
// and ARCHITECTURE.md are updated alongside this, and the parent
// claude/Foundation.md / claude/Architecture.md need the same "2MB -> 5MB"
// pass.
export class WidenMediaByteSizeCap1787790000000 implements MigrationInterface {
  name = 'WidenMediaByteSizeCap1787790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT "CHK_media_assets_byte_size";`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD CONSTRAINT "CHK_media_assets_byte_size" CHECK ("byte_size" <= 5242880);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reversible only if no row larger than the old 2MB cap was inserted
    // while the wider constraint was in force -- ADD CONSTRAINT re-validates
    // existing rows and will fail if one exists. Acceptable: a down-migration
    // past a cap that was already relied on is a genuine data conflict, not
    // something to paper over.
    await queryRunner.query(
      `ALTER TABLE "media_assets" DROP CONSTRAINT "CHK_media_assets_byte_size";`,
    );
    await queryRunner.query(
      `ALTER TABLE "media_assets" ADD CONSTRAINT "CHK_media_assets_byte_size" CHECK ("byte_size" <= 2097152);`,
    );
  }
}
