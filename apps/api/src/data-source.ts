import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

config({ path: resolve(__dirname, '..', '.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});