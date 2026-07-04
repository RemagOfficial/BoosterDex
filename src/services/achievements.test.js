import test from 'node:test';
import assert from 'node:assert/strict';

import { computeProgress } from './achievements.js';

test('Legendary Collection holo achievement counts _h variants', () => {
  const cards = Array.from({ length: 16 }, (_, index) => ({
    id: index === 0 ? 'charizard_h' : `card-${index}`,
    setId: 'lc',
    name: index === 0 ? 'Charizard' : `Card ${index}`,
    rarity: 'Rare',
    holo: true,
  }));

  const progress = computeProgress(cards, [{ id: 'charizard_h' }]);
  const lcHoloProgress = progress.get('lc-holo');

  assert.ok(lcHoloProgress, 'Legendary Collection holo achievement should exist');
  assert.equal(lcHoloProgress.total, 16);
  assert.equal(lcHoloProgress.owned, 1);
  assert.equal(lcHoloProgress.complete, false);
  assert.equal(lcHoloProgress.owned / lcHoloProgress.total, 1 / 16);
});
