import {
  After,
  AfterAll,
  Before,
  BeforeAll,
  setDefaultTimeout,
  setWorldConstructor,
  World,
  type IWorldOptions,
} from '@cucumber/cucumber';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from 'playwright';
import {
  ADMIN,
  CHECK_IN_RESULT,
  CLIMB_LOG_RESULT,
  CLIMBER,
  CRAG_DETAIL,
  CRAG_ID,
  GYM_DETAIL,
  GYM_ID,
  MEDIA_ASSET,
  SEARCH_TARGET,
  SUBMIT_GYM_RESULT,
  SUBMIT_ROUTE_RESULT,
  UNVERIFIED_GYM_DETAIL,
  UNVERIFIED_GYM_ID,
  UNVERIFIED_GYM_PIN,
  UNVERIFIED_CRAG_PIN,
  VERIFIED_GYM_PIN,
  VOTE_CONSENSUS,
} from './fixtures';

setDefaultTimeout(30_000);

// The app under test. `next dev` (or `next start` after a build) must already
// be listening -- this suite deliberately does not spawn it, so a developer
// can keep one dev server up across repeated runs and watch the browser drive
// it.
const BASE_URL = process.env.WEB_BASE_URL ?? 'http://localhost:3000';

// HEADED=1 to watch it run.
const HEADLESS = process.env.HEADED !== '1';

let browser: Browser;

BeforeAll(async function () {
  browser = await chromium.launch({ headless: HEADLESS });
});

AfterAll(async function () {
  await browser?.close();
});

// AR-21, extended. Epic 4 stubbed /api/map/* and nothing else, because its
// scenarios were about CSS and DOM. The Sprint 1/2 backfill's scenarios are
// about *flows* -- log in, upload a photo, submit, be refused -- and the
// reason to stub those is different but at least as strong: the states worth
// asserting are the failure ones.
//
// Reaching "you already verified this route" through a live backend means
// seeding a user, a route, a media asset and a prior verification row; making
// "you are too far away" happen means moving the browser's GPS *and* having
// PostGIS disagree with it. Every one of those refusals already has a green
// scenario in apps/api's own Cucumber suite, over real HTTP against the real
// database -- which is where they belong, because that is where the rule
// lives. What is not proven anywhere else is that this app turns each of them
// into the right sentence on the right screen, and that is exactly what a
// stub can prove honestly.
//
// So: every /api/* response is fixture-driven, and everything else -- the
// forms, the validation, the multipart upload body, Leaflet, the browser's
// Geolocation API, and every line of app code -- is real.

export type SessionKind = 'ANONYMOUS' | 'CLIMBER' | 'ADMIN';

export interface StubResponse {
  status: number;
  body?: unknown;
}

// One recorded request, so a scenario can assert on what the app *sent* --
// which is the only way to prove BL-006's "bolt count is omitted for
// bouldering" and BL-008's "multipart, never base64-in-JSON".
export interface RecordedCall {
  method: string;
  url: string;
  contentType: string;
  json: Record<string, unknown> | null;
  raw: string | null;
}

export class MapUiWorld extends World {
  context!: BrowserContext;
  page!: Page;

  // Every URL the page requested while a scenario ran. BL-022's "no external
  // geocoding service" is an assertion about what did *not* happen, so the
  // evidence has to be collected as it goes.
  requestedUrls: string[] = [];

  // Every /api/* call the app made, with its body.
  calls: RecordedCall[] = [];

  // Set before navigating; Playwright reports this through the real
  // Geolocation API, so the app's useViewerLocation hook runs unmodified.
  geolocation: { latitude: number; longitude: number } | null = null;

  // Flipped by a step so one scenario can prove that a VERIFIED pin gets
  // neither the translucent treatment nor the badge.
  cragStatus: 'UNVERIFIED' | 'VERIFIED' = 'UNVERIFIED';

  // Who /api/auth/me says you are. ANONYMOUS answers 401, which is the
  // ordinary signed-out case and not an error.
  session: SessionKind = 'ANONYMOUS';

  // Opt-in richer fixtures, so Epic 4's scenarios keep the exact payloads
  // they were written against. map-ui.feature's "the two pins do not share
  // a silhouette" counts the markers on the map and asserts there are
  // exactly two, so a third pin cannot join the default set.
  //
  // A richer *crag* is not a flag here: it goes through `overrides` like every
  // other per-scenario payload change (see the note on `overrides` below).
  // There were briefly two mechanisms for the same job and only one of them
  // reached the browser reliably.
  includeUnverifiedGym = false;

  // Per-endpoint overrides, keyed by the names in `defaultResponse` below.
  // This is how a scenario says "the server refuses this one with a 409".
  overrides = new Map<string, StubResponse>();

  // Raw server response for the "Leaflet must not render on the server"
  // scenario, and the map's centre before a search, for the fly-to one.
  serverHtml?: string;
  centreBeforeSearch?: { lat: number; lng: number };

  constructor(options: IWorldOptions) {
    super(options);
  }

  refuse(key: string, status: number, message: string): void {
    this.overrides.set(key, {
      status,
      // Nest's exception filter shape, which lib/api.ts reads to fill
      // ApiError.serverMessage -- the thing AR-26 needs to tell the two
      // different 403s apart.
      body: { statusCode: status, message, error: 'Error' },
    });
  }

  callsTo(fragment: string): RecordedCall[] {
    return this.calls.filter((call) => call.url.includes(fragment));
  }

  async open(path = '/'): Promise<void> {
    this.context = await browser.newContext({
      // Foundation section 17's DoD: climber-facing surfaces are mobile-first,
      // so the suite asserts against a phone viewport rather than a desktop
      // one the design was never drawn for.
      viewport: { width: 390, height: 844 },
      ...(this.geolocation
        ? { geolocation: this.geolocation, permissions: ['geolocation'] }
        : {}),
    });

    this.page = await this.context.newPage();
    this.page.on('request', (request) => this.requestedUrls.push(request.url()));

    await this.stubApi();
    await this.page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  }

  // The admin dashboard is the one surface deliberately not built for a phone
  // (AR-28: dense multi-column with a sidebar), so asserting its layout
  // through a 390px viewport would be asserting the wrong thing.
  async openDesktop(path: string): Promise<void> {
    this.context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    this.page = await this.context.newPage();
    this.page.on('request', (request) => this.requestedUrls.push(request.url()));
    await this.stubApi();
    await this.page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  }

  private cragDetail() {
    return { ...CRAG_DETAIL, status: this.cragStatus };
  }

  // The default answer for each stubbed endpoint. Scenarios override by key
  // rather than by re-registering a Playwright route, so a failure case is one
  // line in a step definition instead of a second copy of the routing table.
  private defaultResponse(key: string): StubResponse {
    switch (key) {
      case 'auth-me':
        return this.session === 'ANONYMOUS'
          ? { status: 401, body: { statusCode: 401, message: 'No active session' } }
          : { status: 200, body: this.session === 'ADMIN' ? ADMIN : CLIMBER };
      case 'auth-login':
      case 'auth-register':
        return { status: 200, body: this.session === 'ADMIN' ? ADMIN : CLIMBER };
      case 'auth-logout':
        return { status: 200, body: { success: true } };
      case 'reset-request':
      case 'reset-confirm':
        return { status: 200, body: { success: true } };
      case 'media':
        return { status: 201, body: MEDIA_ASSET };
      case 'routes':
        return { status: 201, body: SUBMIT_ROUTE_RESULT };
      case 'gyms':
        return { status: 201, body: SUBMIT_GYM_RESULT };
      case 'route-verification':
        return {
          status: 201,
          body: {
            route: { id: CRAG_DETAIL.routes[0].id, status: 'UNVERIFIED' },
            routeNewlyVerified: false,
            cragNewlyVerified: false,
          },
        };
      case 'gym-verification':
        return {
          status: 201,
          body: {
            gym: {
              id: UNVERIFIED_GYM_ID,
              status: 'UNVERIFIED',
              disciplinesOffered: [],
            },
            gymNewlyVerified: false,
          },
        };
      case 'grade-vote':
        return { status: 201, body: VOTE_CONSENSUS };
      case 'climb-log':
        return { status: 201, body: CLIMB_LOG_RESULT };
      case 'gym-check-in':
        return { status: 201, body: CHECK_IN_RESULT };
      case 'admin-verify':
        return {
          status: 200,
          body: {
            id: UNVERIFIED_GYM_ID,
            status: 'VERIFIED',
            disciplinesOffered: ['BOULDERING'],
          },
        };
      case 'map-pins':
        return {
          status: 200,
          body: [
            { ...UNVERIFIED_CRAG_PIN, status: this.cragStatus },
            VERIFIED_GYM_PIN,
            ...(this.includeUnverifiedGym ? [UNVERIFIED_GYM_PIN] : []),
          ],
        };
      case 'map-crag':
        return { status: 200, body: this.cragDetail() };
      case 'map-gym':
        return { status: 200, body: GYM_DETAIL };
      case 'map-gym-unverified':
        return { status: 200, body: UNVERIFIED_GYM_DETAIL };
      case 'map-search':
        return { status: 200, body: [SEARCH_TARGET] };
      default:
        return { status: 501, body: { message: `No stub for "${key}"` } };
    }
  }

  private async fulfil(key: string, route: Route): Promise<void> {
    const request = route.request();
    const headers = request.headers();
    const raw = request.postData();

    let json: Record<string, unknown> | null = null;
    if (raw && (headers['content-type'] ?? '').includes('application/json')) {
      try {
        json = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        json = null;
      }
    }

    this.calls.push({
      method: request.method(),
      url: request.url(),
      contentType: headers['content-type'] ?? '',
      json,
      raw,
    });

    const response = this.overrides.get(key) ?? this.defaultResponse(key);
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: JSON.stringify(response.body ?? {}),
    });
  }

  private async stubApi(): Promise<void> {
    const on = (pattern: string, key: string) =>
      this.page.route(pattern, (route) => void this.fulfil(key, route));

    // Playwright resolves routes in reverse registration order, so this
    // catch-all is registered first and every specific handler below wins over
    // it. Its job is to make an unstubbed endpoint fail loudly and instantly
    // rather than fall through to the dev server's proxy and hang for the
    // length of a connection timeout against an API that is not running.
    await this.page.route('**/api/**', (route) =>
      route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({
          message: `Unstubbed endpoint: ${route.request().url()}`,
        }),
      }),
    );

    await on('**/api/auth/me', 'auth-me');
    await on('**/api/auth/login', 'auth-login');
    await on('**/api/auth/register', 'auth-register');
    await on('**/api/auth/logout', 'auth-logout');
    await on('**/api/auth/password-reset/request', 'reset-request');
    await on('**/api/auth/password-reset/confirm', 'reset-confirm');

    await on('**/api/media', 'media');
    await on('**/api/routes', 'routes');
    await on('**/api/gyms', 'gyms');

    await on('**/api/routes/*/verifications', 'route-verification');
    await on('**/api/gyms/*/verifications', 'gym-verification');
    await on('**/api/routes/*/grade-votes', 'grade-vote');
    await on('**/api/routes/*/climb-logs', 'climb-log');
    await on('**/api/gyms/*/check-ins', 'gym-check-in');
    await on('**/api/gyms/*/admin-verify', 'admin-verify');

    await on('**/api/map/pins', 'map-pins');
    await on(`**/api/map/crags/${CRAG_ID}`, 'map-crag');
    await on(`**/api/map/gyms/${GYM_ID}`, 'map-gym');
    await on(`**/api/map/gyms/${UNVERIFIED_GYM_ID}`, 'map-gym-unverified');
    await on('**/api/map/search**', 'map-search');
  }
}

setWorldConstructor(MapUiWorld);

Before(function (this: MapUiWorld) {
  this.requestedUrls = [];
  this.calls = [];
  this.geolocation = null;
  this.cragStatus = 'UNVERIFIED';
  this.session = 'ANONYMOUS';
  this.includeUnverifiedGym = false;
  this.overrides = new Map();
});

After(async function (this: MapUiWorld) {
  await this.context?.close();
});
