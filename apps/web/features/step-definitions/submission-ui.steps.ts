import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MapUiWorld } from '../support/world';

// AR-35. SubmitRouteDto validates a flat 0-31 for every discipline, because
// the DTO is not discipline-aware; a dropdown is. Offering V19 on a boulder
// problem would be offering an ordinal the V-scale has no label for -- one
// that renders as "?" and that the server would nonetheless happily store --
// so the picker is clamped to the real scale and these two steps are what
// hold that line.

async function gradeLabels(world: MapUiWorld): Promise<string[]> {
  const select = world.page.locator('[data-testid="grade-select"]');
  await select.waitFor({ state: 'visible', timeout: 15_000 });
  return select.locator('option').allTextContents();
}

Then(
  'the grade list offers {string}',
  async function (this: MapUiWorld, label: string) {
    const labels = await gradeLabels(this);
    assert.ok(
      labels.includes(label),
      `expected the grade list to offer "${label}"`,
    );
  },
);

Then(
  'the grade list does not offer {string}',
  async function (this: MapUiWorld, label: string) {
    const labels = await gradeLabels(this);
    assert.ok(
      !labels.includes(label),
      `expected the grade list not to offer "${label}"`,
    );
  },
);
