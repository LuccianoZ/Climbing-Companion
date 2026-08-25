import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

export class AuthWorld extends World {
  app!: INestApplication;
  response!: request.Response;

  constructor(options: IWorldOptions) {
    super(options);
  }

  async initApp(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    this.app = moduleRef.createNestApplication();
    // Mirror main.ts exactly so BDD scenarios exercise the same request
    // pipeline (prefix + validation) that production traffic gets.
    this.app.setGlobalPrefix('api');
    this.app.use(cookieParser());
    this.app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await this.app.init();
  }

  get http() {
    return request(this.app.getHttpServer());
  }
}

setWorldConstructor(AuthWorld);
