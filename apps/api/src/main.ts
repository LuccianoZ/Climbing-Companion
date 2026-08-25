import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { assertNotMisconfiguredForProduction } from './bootstrap-guard';

async function bootstrap() {
  // BL-005 / Architecture.md AR-13 (Foundation §19.3): resolved once,
  // before anything else -- no HTTP listener opens if this fails.
  assertNotMisconfiguredForProduction(process.env);

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
