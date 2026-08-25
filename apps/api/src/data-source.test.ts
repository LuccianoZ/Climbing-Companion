import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

config({ path: resolve(__dirname, '..', '.env.test') });

// Mirrors data-source.ts but points at climbing_companion_test (Architecture.md
// AR-9) so `npm run migration:run:test` can apply migrations there without
// touching the dev database.
export const AppTestDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
