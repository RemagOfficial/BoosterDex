/**
 * Economy mode pricing.
 *
 * Pack prices start at 100 coins for the oldest set (Base Set) and
 * increase by ×1.25 per set in release order, rounded to the nearest 10.
 *
 * Sell prices are a rarity-scaled fraction of the set's pack price.
 */

import { getGradeMultiplier } from './grading.js';
import { SETS } from './sets.js';

// Sets in release order — matches the order in sets.js
export const SET_ORDER = SETS.map((set) => set.id);

function isSpecialExpansion(set) {
  return set?.expansionGroup === 'special';
}

// Build the price table once at module load
export const PACK_PRICES = (() => {
  const prices = {};
  // Main-series price steps start at 100 and increase by x1.25.
  // Special expansions are priced at the next main-series step so they don't
  // shift every following main set's price upward.
  let nextMainStep = 100;
  for (const set of SETS) {
    if (isSpecialExpansion(set)) {
      prices[set.id] = Math.round(nextMainStep / 10) * 10;
      continue;
    }
    prices[set.id] = Math.round(nextMainStep / 10) * 10;
    nextMainStep *= 1.25;
  }
  return prices;
})();

// Starting balance = 3 × the cheapest pack (Base Set)
export const STARTING_BALANCE = PACK_PRICES['base1'] * 3; // 300 coins

// Fraction of pack price returned when selling a card.
//
// Designed so that selling ALL cards from a worst-case pack (non-holo rare)
// returns exactly the pack price — i.e. the player always breaks even.
//
// WotC-era pack: 6 commons + 3 uncommons + 1 rare (no RH slot)
//   6×0.06 + 3×0.12 + 0.28 = 0.36 + 0.36 + 0.28 = 1.00  ✓
//
// EX-era pack:  5 commons + 3 uncommons + 1 reverse holo + 1 rare (RH slot)
//   5×0.06 + 3×0.12 + 0.06×1.25 (min RH) + 0.28 ≈ 1.01  ✓
//
// Holo rares and above earn a bonus so the player profits on premium pulls.
const RARITY_SELL_FACTOR = {
  'Common':      0.06,
  'Uncommon':    0.12,
  'Rare':        0.28,
  'Rare BREAK':  0.35,
  'Rare ex':     0.60,
  'Ultra Rare':  0.80,
  'Rare LV.X':   0.60,
  'Rare Shiny':  1.50,
  'Radiant Rare': 1.50,
  'Secret Rare': 1.00,
};
const HOLO_SELL_MULTIPLIER         = 1.5;   // full holo treatment
const REVERSE_HOLO_SELL_MULTIPLIER = 1.25;  // reverse holo treatment

/**
 * Returns the coin value for selling a single duplicate card.
 * @param {object} card  - card object with `rarity`, `holo`, and `reverseHolo` fields
 * @param {string} setId - the set the card belongs to
 */
export function getSellPrice(card, setId, sellMultiplier = 1) {
  const packPrice  = PACK_PRICES[setId] ?? PACK_PRICES['base1'];
  const baseFactor = RARITY_SELL_FACTOR[card.rarity] ?? 0.06;
  let factor = baseFactor;
  if (card.holo)             factor = baseFactor * HOLO_SELL_MULTIPLIER;
  else if (card.reverseHolo) factor = baseFactor * REVERSE_HOLO_SELL_MULTIPLIER;
  factor *= getGradeMultiplier(card.grade);
  factor *= Math.max(0.1, Number.isFinite(sellMultiplier) ? sellMultiplier : 1);
  // Math.ceil ensures that 6 commons + 3 uncommons + 1 non-holo rare always
  // sums to at least the pack price (verified across every set in SET_ORDER).
  return Math.max(1, Math.ceil(packPrice * factor));
}

  /** Number of packs in a booster box. */
  export const BOOSTER_BOX_SIZE = 36;
  /** A box costs this many times the single-pack price (better deal than buying singles). */
  export const BOOSTER_BOX_MULTIPLIER = 25;
