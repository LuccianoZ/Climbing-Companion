import { MigrationInterface, QueryRunner } from 'typeorm';

// Foundation Revision Sept 3 2026 (AR-51), BL-x06: gym verification becomes
// a confirm/dispute step.
//
//  - A verifier answering "Yes, the submission is accurate" counts toward
//    the 4. The photo is now OPTIONAL (was required) and disciplines are no
//    longer collected here at all -- gyms.disciplines_offered is set once,
//    at submission (BL-x04), so the AR-17 "union the four verifiers'
//    disciplines_submitted arrays on the 4th verification" step is deleted.
//    Both columns therefore drop their NOT NULL. `disciplines_submitted` is
//    kept (nullable) rather than dropped so this migration's down() is a
//    clean re-add and any historical rows survive.
//
//  - A verifier answering "No" writes NO gym_verifications row. Instead a
//    gym_information_disputes row records the free-text "what is
//    inaccurate?" for an admin to action (Foundation §14). No UNIQUE
//    constraint -- one gym can collect several open disputes.
export class RelaxGymVerificationAddDisputes1787810000000 implements MigrationInterface {
  name = 'RelaxGymVerificationAddDisputes1787810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gym_verifications" ALTER COLUMN "media_asset_id" DROP NOT NULL;`,
    );
    await queryRunner.query(
      `ALTER TABLE "gym_verifications" ALTER COLUMN "disciplines_submitted" DROP NOT NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE "gym_information_disputes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "gym_id" uuid NOT NULL,
        "reporter_user_id" uuid NOT NULL,
        "detail" varchar(500) NOT NULL,
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gym_information_disputes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_gym_information_disputes_gym_id" FOREIGN KEY ("gym_id") REFERENCES "gyms" ("id"),
        CONSTRAINT "FK_gym_information_disputes_reporter_user_id" FOREIGN KEY ("reporter_user_id") REFERENCES "users" ("id")
      );
    `);

    // The Admin Dashboard's dispute queue only ever scans unresolved rows.
    await queryRunner.query(
      `CREATE INDEX "IDX_gym_information_disputes_open" ON "gym_information_disputes" ("gym_id") WHERE "resolved_at" IS NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "gym_information_disputes";`);

    // Re-adding NOT NULL re-validates existing rows: it fails if a
    // photo-less or discipline-less verification was written while the
    // constraint was relaxed. That is a real conflict (the row could not
    // exist under the old schema), not something to silence.
    await queryRunner.query(
      `ALTER TABLE "gym_verifications" ALTER COLUMN "disciplines_submitted" SET NOT NULL;`,
    );
    await queryRunner.query(
      `ALTER TABLE "gym_verifications" ALTER COLUMN "media_asset_id" SET NOT NULL;`,
    );
  }
}
