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
  // BL-006: holds the result of a direct RoutesService.findVisibleCrags()
  // call -- there's no map-query HTTP endpoint yet (that's Epic 4, Sprint
  // 2), so this reaches the service in-process rather than over HTTP. See
  // Architecture.md AR-14.
  visibleCrags?: unknown[];
  // BL-008: the raw bytes sent in the most recent media upload, kept
  // around so a later step can assert the streaming GET returns the exact
  // same bytes back rather than just "some bytes".
  uploadedBuffer?: Buffer;
  // BL-008: the id returned by a successful POST /api/media, and the most
  // recent response from streaming GET /api/media/:id -- kept separate
  // from `response` since a scenario issues both an upload and one or more
  // streaming requests and needs to assert on each independently.
  uploadedMediaId?: string;
  mediaResponse?: request.Response;

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
