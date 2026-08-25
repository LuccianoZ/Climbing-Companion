import { MigrationInterface, QueryRunner } from 'typeorm';

// BL-002 (Architecture.md AR-10): a login session is one active refresh
// token per user, stored directly on `users` -- matches Backlog.md's
// "Tables touched: users" for this story rather than introducing an
// undocumented sessions table.
export class AddRefreshTokenToUsers1787692612866 implements MigrationInterface {
  name = 'AddRefreshTokenToUsers1787692612866';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "refresh_token_hash" text,
        ADD COLUMN "refresh_token_expires_at" timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "refresh_token_hash",
        DROP COLUMN "refresh_token_expires_at";
    `);
  }
}
