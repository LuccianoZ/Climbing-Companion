import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MapUiWorld } from '../support/world';

// Epic 6 UI steps (BL-027/028). Most of this feature runs on shared.steps.ts
// -- these are the few phrasings specific to the Alerts feed and the flag
// queue.

Given('the climber is signed in but suspended', function (this: MapUiWorld) {
  this.session = 'SUSPENDED';
});

Given('there are no notifications', function (this: MapUiWorld) {
  this.overrides.set('notifications', { status: 200, body: [] });
});

Then(
  '{int} alerts are marked unread',
  async function (this: MapUiWorld, count: number) {
    await this.page
      .locator('[data-testid="alerts-list"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    // Give markAllRead's state update a beat to flush on the second call.
    await this.page.waitForTimeout(200);
    const unread = await this.page
      .locator('[data-testid^="alert-"][data-unread="true"]')
      .count();
    assert.equal(unread, count, `expected ${count} unread alerts, saw ${unread}`);
  },
);

Then(
  'the flag queue has {int} rows',
  async function (this: MapUiWorld, count: number) {
    await this.page
      .locator('[data-testid="flag-queue"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const rows = await this.page
      .locator('[data-testid="flag-queue-row"]')
      .count();
    assert.equal(rows, count);
  },
);

Then(
  'the verification-photo row shows the strike-on-rejection badge',
  async function (this: MapUiWorld) {
    await this.page
      .locator(
        '[data-testid="flag-queue-row"][data-purpose="ROUTE_VERIFICATION_PHOTO"] [data-testid="flag-queue-verification-badge"]',
      )
      .waitFor({ state: 'visible', timeout: 15_000 });
  },
);

When(
  'the climber taps the review button for the {word} photo',
  async function (this: MapUiWorld, which: string) {
    const purpose =
      which === 'verification' ? 'ROUTE_VERIFICATION_PHOTO' : 'REVIEW_PHOTO';
    await this.page
      .locator(
        `[data-testid="flag-queue-row"][data-purpose="${purpose}"] [data-testid="flag-queue-review"]`,
      )
      .click();
  },
);
