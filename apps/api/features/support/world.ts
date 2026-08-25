import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/mail/mail.service';

export class AuthWorld extends World {
  app!: INestApplication;
  response!: request.Response;
  // BL-003: holds the "name=value" pair of a captured session cookie
  // (stripped of its Path/Expires/HttpOnly attributes) so later steps can
  // replay it as a request's Cookie header -- e.g. to prove a cookie
  // captured before logout is rejected afterwards.
  sessionCookie!: string;
  // BL-004: holds the raw single-use token pulled out of the stubbed
  // password-reset email so a later step can redeem it.
  resetToken?: string;

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

  // BL-004 / Architecture.md AR-12: Foundation §16 requires email be fully
  // stubbed in tests -- this reaches into that stub via the app's own DI
  // container rather than the suite ever touching a real mail provider.
  get mail(): MailService {
    return this.app.get(MailService);
  }
}

setWorldConstructor(AuthWorld);
