import { Before, After } from '@cucumber/cucumber';
import { DataSource } from 'typeorm';
import { AuthWorld } from './world';

Before(async function (this: AuthWorld) {
  await this.initApp();
  // Truncate before, not after -- keeps the suite self-healing if a previous
  // run crashed mid-scenario without reaching its After hook. Scoped to
  // `users` only; extend this list as later epics add tables scenarios need
  // reset between runs.
  const dataSource = this.app.get(DataSource);
  await dataSource.query('TRUNCATE TABLE "users" CASCADE');
});

After(async function (this: AuthWorld) {
  await this.app.close();
});
