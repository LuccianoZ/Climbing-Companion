import { MigrationInterface, QueryRunner } from 'typeorm';

// Foundation Revision Sept 3 2026 (AR-51), BL-x04: a gym submission now
// captures Sunday-Saturday operating hours and the gym's IANA timezone.
//
// `operating_hours` is a single jsonb column, not a child table -- the
// value is display-only, always fetched whole with the gym, and never
// queried by predicate at MVP scope (AR-51). Shape:
//   { "0".."6": [ { "opens": "HH:MM", "closes": "HH:MM", "fullDay": bool } ] }
//   0 = Sunday; [] or missing key = closed that day; closes < opens = the
//   range crosses midnight; fullDay + 00:00/00:00 = open 24h; multiple
//   entries = split shift. Enforced by a class-validator decorator on the
//   DTO, not the DB -- same convention as grade ordinals (Architecture §1).
//
// `iana_timezone` is derived from the pin coordinates at submission via the
// offline `tz-lookup` package (no network -- Foundation §9 "no external
// geocoding"). Added NOT NULL with a throwaway 'UTC' default so the column
// is valid on the (currently empty) table, then the default is dropped so
// every future insert must supply a real zone.
export class AddGymOperatingHoursAndTimezone1787800000000 implements MigrationInterface {
  name = 'AddGymOperatingHoursAndTimezone1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD COLUMN "operating_hours" jsonb NOT NULL DEFAULT '{}'::jsonb;`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ADD COLUMN "iana_timezone" text NOT NULL DEFAULT 'UTC';`,
    );
    await queryRunner.query(
      `ALTER TABLE "gyms" ALTER COLUMN "iana_timezone" DROP DEFAULT;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gyms" DROP COLUMN "iana_timezone";`);
    await queryRunner.query(
      `ALTER TABLE "gyms" DROP COLUMN "operating_hours";`,
    );
  }
}
