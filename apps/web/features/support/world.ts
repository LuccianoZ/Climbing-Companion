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
} from 'playwright';
import {
  CRAG_DETAIL,
  CRAG_ID,
  GYM_DETAIL,
  GYM_ID,
  SEARCH_TARGET,
  UNVERIFIED_CRAG_PIN,
  VERIFIED_GYM_PIN,
} from './fixtures';

setDefaultTimeout(30_000);

// The app under test. `next dev` (or `next start` after a build) must
// already be listening -- this suite deliberately does not spawn it, so a
// developer can keep one dev server up across repeated runs and watch the
// browser drive it.
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

export class MapUiWorld extends World {
  context!: BrowserContext;
  page!: Page;

  // Every URL the page requested while a scenario ran. BL-022's "no
  // external geocoding service" is an assertion about what did *not*
  // happen, so the evidence has to be collected as it goes.
  requestedUrls: string[] = [];

  // Set before navigating; Playwright reports this through the real
  // Geolocation API, so the app's useViewerLocation hook runs unmodified.
  geolocation: { latitude: number; longitude: number } | null = null;

  // Flipped by a step so one scenario can prove that a VERIFIED pin gets
  // neither the translucent treatment nor the badge.
  cragStatus: 'UNVERIFIED' | 'VERIFIED' = 'UNVERIFIED';

  // Raw server response for the "Leaflet must not render on the server"
  // scenario, and the map's centre before a search, for the fly-to one.
  serverHtml?: string;
  centreBeforeSearch?: { lat: number; lng: number };

  constructor(options: IWorldOptions) {
    super(options);
  }

  async open(path = '/'): Promise<void> {
    this.context = await browser.newContext({
      // Foundation §17's DoD: climber-facing surfaces are mobile-first, so
      // the suite asserts against a phone viewport rather than a desktop
      // one the design was never drawn for.
      viewport: { width: 390, height: 844 },
      ...(this.geolocation
        ? { geolocation: this.geolocation, permissions: ['geolocation'] }
        : {}),
    });

    this.page = await this.context.newPage();
    this.page.on('request', (request) => this.requestedUrls.push(request.url()));

    await this.stubMapApi();
    await this.page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  }

  // See fixtures.ts for why the API is stubbed and what is not.
  private async stubMapApi(): Promise<void> {
    const json = (body: unknown) => ({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    await this.page.route('**/api/map/pins', (route) =>
      route.fulfill(
        json([
          { ...UNVERIFIED_CRAG_PIN, status: this.cragStatus },
          VERIFIED_GYM_PIN,
        ]),
      ),
    );

    await this.page.route(`**/api/map/crags/${CRAG_ID}`, (route) =>
      route.fulfill(json({ ...CRAG_DETAIL, status: this.cragStatus })),
    );

    await this.page.route(`**/api/map/gyms/${GYM_ID}`, (route) =>
      route.fulfill(json(GYM_DETAIL)),
    );

    await this.page.route('**/api/map/search**', (route) =>
      route.fulfill(json([SEARCH_TARGET])),
    );
  }
}

setWorldConstructor(MapUiWorld);

Before(function (this: MapUiWorld) {
  this.requestedUrls = [];
  this.geolocation = null;
  this.cragStatus = 'UNVERIFIED';
});

After(async function (this: MapUiWorld) {
  await this.context?.close();
});
