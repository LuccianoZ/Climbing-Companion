import { MigrationInterface, QueryRunner } from 'typeorm';

// BL-004 (Architecture.md §2 `password_reset_tokens`): single-use,
// short-lived tokens for the "forgot password" email-link flow. FK to
// `users` with ON DELETE CASCADE -- no account-deletion feature exists yet,
// but an outstanding reset token has no reason to survive the account it
// points at, so CASCADE is the least-surprising choice now rather than an
// undecided default revisited later.
export class CreatePasswordResetTokens1787696102796 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1787696102796';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" text NOT NULL UNIQUE,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_password_reset_tokens_user_id" ON "password_reset_tokens" ("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "password_reset_tokens";`);
  }
}
