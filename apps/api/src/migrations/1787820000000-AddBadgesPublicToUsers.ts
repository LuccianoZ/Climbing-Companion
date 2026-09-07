import { MigrationInterface, QueryRunner } from 'typeorm';

// Architecture.md §2 / AR-53 (Sept 7, 2026). Independent of the existing
// `is_private` (BL-047, photo-gallery-only): this gates a non-friend's view
// of a user's gym-badge shelf. Default `true` matches Foundation §12's
// pre-existing "climbing metrics are always public" baseline. Friends and
// the owner always see the shelf regardless of this flag -- it only ever
// affects a Visitor's or non-friend's read (BL-x09).
export class AddBadgesPublicToUsers1787820000000 implements MigrationInterface {
  name = 'AddBadgesPublicToUsers1787820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "badges_public" boolean NOT NULL DEFAULT true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "badges_public";`);
  }
}
