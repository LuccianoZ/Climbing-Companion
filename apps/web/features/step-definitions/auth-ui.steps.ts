import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MapUiWorld } from '../support/world';

// AR-23: /login and /register are two routes over one component, so the thing
// worth asserting is not "a login page exists" but that the card knows which
// mode it is in -- the switch is a real toggle, not two separate screens.
Then(
  'the auth card is in {string} mode',
  async function (this: MapUiWorld, mode: string) {
    const form = this.page.locator('[data-testid="auth-form"]');
    await form.waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await form.getAttribute('data-auth-mode'), mode);
  },
);
