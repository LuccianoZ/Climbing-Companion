import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { RoutesModule } from './routes/routes.module';
import { GymsModule } from './gyms/gyms.module';
import { MediaModule } from './media/media.module';
import { VerificationsModule } from './verifications/verifications.module';
import { ArchivalModule } from './archival/archival.module';
import { TestBypassModule } from './auth/test-bypass.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // BDD scenarios (features/support/env.ts) set NODE_ENV=test before this
      // module loads, so Cucumber runs against climbing_companion_test
      // instead of the dev database (see .env.test / Architecture.md AR-9).
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        // Migrations only -- synchronize:true is banned everywhere (Foundation §20.1).
        synchronize: false,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
      }),
    }),
    // BL-013 / Architecture.md §9: registers @nestjs/schedule's internal
    // SchedulerRegistry once at the root so ArchivalModule's @Cron wrapper
    // (a thin caller of ArchivalService.archiveExpiredUnverifiedItems(),
    // the plain directly-callable method Cucumber actually exercises) can
    // fire in a running app. Order relative to ConfigModule.forRoot()
    // above doesn't matter the way TestBypassModule's does -- nothing here
    // reads process.env at module-construction time.
    ScheduleModule.forRoot(),
    AuthModule,
    RoutesModule,
    GymsModule,
    MediaModule,
    VerificationsModule,
    ArchivalModule,
    // BL-005 / Architecture.md AR-13: must come after ConfigModule.forRoot()
    // above in this array -- ConfigModule.forRoot() synchronously loads
    // .env/.env.test into process.env as it's constructed, and
    // TestBypassModule.register() (also called synchronously, right here,
    // as this array literal is evaluated) depends on that already having
    // happened so it can read ENABLE_TEST_BYPASS_HEADERS from process.env.
    TestBypassModule.register(),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
