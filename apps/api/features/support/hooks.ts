import { Before, After } from '@cucumber/cucumber';
import { DataSource } from 'typeorm';
import { AuthWorld } from './world';

Before(async function (this: AuthWorld) {
  await this.initApp();
  // Truncate before, not after -- keeps the suite self-healing if a previous
  // run crashed mid-scenario without reaching its After hook. `crags`,
  // `routes` (BL-006), `gyms` (BL-007), `media_assets` (BL-008), and
  // `route_verifications`/`route_grade_votes` (BL-009) are listed
  // explicitly even though TRUNCATE...CASCADE on `users` alone would
  // already sweep them up via their created_by/submitted_by/owner_user_id/
  // verifier_user_id FKs -- being explicit keeps this list an accurate map
  // of "tables scenarios touch" rather than relying on FK topology to be
  // remembered later. Extend as later epics add more.
  const dataSource = this.app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE "users", "crags", "routes", "gyms", "media_assets", "route_verifications", "route_grade_votes", "gym_verifications" CASCADE',
  );
});

After(async function (this: AuthWorld) {
  await this.app.close();
});
