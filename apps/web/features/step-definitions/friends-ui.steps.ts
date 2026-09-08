import { Given } from '@cucumber/cucumber';
import { MapUiWorld } from '../support/world';

// Epic 9 UI steps (AR-55, BL-040/041). Everything else this feature needs
// -- signed-in/out, opens, taps, "is on screen", "reads" -- is shared.

Given('the climber has no friends yet', function (this: MapUiWorld) {
  this.overrides.set('friends', { status: 200, body: [] });
});

Given('the invite link is no longer valid', function (this: MapUiWorld) {
  this.overrides.set('friend-invite-redeem', {
    status: 410,
    body: { message: 'This invite link has already been used or has expired.' },
  });
});

Given("the invite link is the climber's own", function (this: MapUiWorld) {
  this.overrides.set('friend-invite-redeem', {
    status: 400,
    body: { message: 'You cannot use your own invite link.' },
  });
});
