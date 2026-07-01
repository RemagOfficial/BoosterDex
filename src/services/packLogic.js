/**
 * Base Set booster pack composition (10 cards):
 *   1 rare slot  – 33 % Rare Holo, 67 % Rare
 *   3 uncommons
 *   6 commons
 *
 * Real 1999 packs had 11 cards (+ 1 basic energy), but 10-card packs are
 * the modern convention and keep the UI clean. Adjust PACK_SIZE if desired.
 */

function pickRandom(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Weighted pick without replacement.
 * Cards already in ownedIds get 80% weight so free packs favour new cards.
 * Falls back to uniform random when ownedIds is null/empty.
 */
function pickWeighted(pool, count, ownedIds, ownedWeight = 0.8) {
  if (!ownedIds || ownedIds.size === 0 || pool.length === 0) return pickRandom(pool, count);
  const clampedOwnedWeight = Math.min(1, Math.max(0.05, ownedWeight));
  const items = pool.map((card) => ({ card, weight: ownedIds.has(card.id) ? clampedOwnedWeight : 1.0 }));
  const result = [];
  for (let i = 0; i < count && items.length > 0; i++) {
    const total = items.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    let idx = items.length - 1;
    for (let j = 0; j < items.length; j++) { r -= items[j].weight; if (r <= 0) { idx = j; break; } }
    result.push(items[idx].card);
    items.splice(idx, 1);
  }
  return result;
}

const PREMIUM_COOLDOWN_PACKS = 3;
const PREMIUM_COOLDOWN_BASE_MULTIPLIER = 0.75;
const PREMIUM_COOLDOWN_STEP = 0.15;

const premiumCooldownBySet = new Map();

function getPackSetId(allCards, explicitSetId = null) {
  return explicitSetId ?? allCards.find((card) => card?.setId)?.setId ?? null;
}

function hasPlainRares(allCards) {
  return allCards.some((card) => card.rarity === 'Rare' && card.holo !== true && card.reverseHolo !== true);
}

function getCooldownState(setId, eligible) {
  if (!setId || !eligible) return null;
  if (!premiumCooldownBySet.has(setId)) {
    premiumCooldownBySet.set(setId, { packsLeft: 0, tier: 0 });
  }
  return premiumCooldownBySet.get(setId);
}

function getCooldownMultiplier(state) {
  if (!state || state.packsLeft <= 0 || state.tier <= 0) return 1;
  return Math.max(0.4, PREMIUM_COOLDOWN_BASE_MULTIPLIER - ((state.tier - 1) * PREMIUM_COOLDOWN_STEP));
}

function advanceCooldown(state) {
  if (!state) return;
  if (state.packsLeft > 0) {
    state.packsLeft -= 1;
    if (state.packsLeft <= 0) {
      state.packsLeft = 0;
      state.tier = 0;
    }
  }
}

function notePremiumHit(state, wasActive) {
  if (!state) return;
  if (!wasActive) {
    state.packsLeft = PREMIUM_COOLDOWN_PACKS;
    state.tier = 1;
    return;
  }
  state.tier = Math.min(state.tier + 1, 4);
}

function isCooldownPremiumHit(card) {
  return card?.rarity === 'Secret Rare'
    || card?.rarity === 'Ultra Rare'
    || card?.rarity === 'Rare BREAK'
    || card?.rarity === 'Rare ex'
    || card?.rarity === 'Rare LV.X'
    || card?.rarity === 'Rare Shiny';
}

function rollWithMultiplier(probability, multiplier) {
  return Math.random() < (probability * multiplier);
}

export function openPack(allCards, setId = null, options = null) {
  const ownedIds = options instanceof Set ? options : options?.ownedIds ?? null;
  const ownedWeight = options instanceof Set ? 0.8 : options?.ownedWeight ?? 0.8;
  const packSetId = getPackSetId(allCards, setId);
  const cooldownState = getCooldownState(packSetId, !hasPlainRares(allCards));
  const cooldownWasActive = cooldownState?.packsLeft > 0;
  const cooldownMultiplier = getCooldownMultiplier(cooldownState);
  advanceCooldown(cooldownState);
  const holoRares    = allCards.filter((c) => c.rarity === 'Rare' && c.holo === true && !c.reverseHolo);
  const rares        = allCards.filter((c) => c.rarity === 'Rare' && !c.holo && !c.reverseHolo);
  const uncommons    = allCards.filter((c) => c.rarity === 'Uncommon' && !c.reverseHolo);
  const commons      = allCards.filter((c) => c.rarity === 'Common' && !c.reverseHolo);
  const secretRares  = allCards.filter((c) => c.rarity === 'Secret Rare' && !c.reverseHolo);
  const ultraRares   = allCards.filter((c) => c.rarity === 'Ultra Rare' && !c.reverseHolo);
  const breakCards   = allCards.filter((c) => c.rarity === 'Rare BREAK' && !c.reverseHolo);
  const radiantCards = allCards.filter((c) => c.rarity === 'Radiant Rare' && !c.reverseHolo);
  const exCards      = allCards.filter((c) => c.rarity === 'Rare ex' || c.rarity === 'Rare LV.X');
  const shinyCards   = allCards.filter((c) => c.rarity === 'Rare Shiny');
  const reverseHolos = allCards.filter((c) => c.reverseHolo === true);

  // Legendary Collection has special pack composition: 6 commons, 2 uncommons, 1 rare, 1 reverse (last)
  const isLegendaryCollection = packSetId === 'lc';
  // Dragon's Vault has special pack composition: 5 cards, all holo, last card uses standard premium slot
  const isDragonsVault = packSetId === 'dv1';
  // Double Crisis has special pack composition: 6 cards (3 commons, 3 uncommons, hit slot - no reverse)
  const isDoubleCrisis = packSetId === 'dc1';
  // Generations has special pack composition: 10 cards, 2 from Radiant Collection (RC prefix)
  const isGenerations = packSetId === 'g1';
  const hasRH = reverseHolos.length > 0;
  // pick: weighted for free packs (20% less likely to pull already-owned cards)
  const pick  = (pool, n) => pickWeighted(pool, n, ownedIds, ownedWeight);
  let rhSlot  = hasRH ? pick(reverseHolos, 1) : [];

  // Radiant cards are reverse-slot hits and use shiny-tier odds.
  if (radiantCards.length > 0 && Math.random() < 1 / 90) {
    rhSlot = pick(radiantCards, 1);
  }

  // Dragon's Vault special pack logic: 5 cards, all holo, last card uses standard premium slot
  if (isDragonsVault) {
    // Dragon's Vault has only Rare and Secret Rare cards, all are effectively holo
    // First 4 cards must be regular Rare cards (no secret rares)
    const dvRegularCards = allCards.filter((c) => !c.reverseHolo && c.rarity !== 'Secret Rare');
    
    // First 4 cards are regular cards (all holo in this set)
    const firstFour = pick(dvRegularCards, 4);
    
    // Last card uses standard premium card logic (secret rare, ultra rare, break, ex, shiny, etc.)
    // Shiny Pokémon: ~1-in-90 chance
    if (shinyCards.length > 0 && rollWithMultiplier(1 / 90, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(shinyCards, 1)];
    }

    // Secret rare: ~1-in-45 chance
    if (secretRares.length > 0 && rollWithMultiplier(1 / 45, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(secretRares, 1)];
    }

    // Ultra Rare: ~1-in-18 chance
    if (ultraRares.length > 0 && rollWithMultiplier(1 / 18, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(ultraRares, 1)];
    }

    // BREAK cards: ~1-in-5 chance
    if (breakCards.length > 0 && rollWithMultiplier(1 / 5, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(breakCards, 1)];
    }

    // EX Pokemon: ~1-in-9 chance
    if (exCards.length > 0 && rollWithMultiplier(1 / 9, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(exCards, 1)];
    }

    // Default to regular card if no premium hit
    return [...firstFour, ...pick(dvRegularCards, 1)];
  }

  // Generations special pack logic: 10 cards, 2 from Radiant Collection (RC prefix)
  if (isGenerations) {
    // Radiant Collection cards have localId starting with 'RC'
    const radiantCollectionCards = allCards.filter((c) => String(c.localId).startsWith('RC') && !c.reverseHolo);
    
    // Exclude RC cards from all pools to ensure base pack is from normal set only
    const normalSetCards = allCards.filter((c) => !String(c.localId).startsWith('RC'));
    const normalShinyCards = normalSetCards.filter((c) => c.rarity === 'Rare Shiny');
    const normalSecretRares = normalSetCards.filter((c) => c.rarity === 'Secret Rare');
    const normalUltraRares = normalSetCards.filter((c) => c.rarity === 'Ultra Rare');
    const normalBreakCards = normalSetCards.filter((c) => c.rarity === 'Rare BREAK' && !c.reverseHolo);
    const normalExCards = normalSetCards.filter((c) => c.rarity === 'Rare ex' || c.rarity === 'Rare LV.X');
    const normalHoloRares = normalSetCards.filter((c) => c.holo === true && c.rarity !== 'Secret Rare' && !c.reverseHolo);
    const normalRares = normalSetCards.filter((c) => c.rarity === 'Rare' && !c.holo && !c.reverseHolo);
    const normalUncommons = normalSetCards.filter((c) => c.rarity === 'Uncommon' && !c.reverseHolo);
    const normalCommons = normalSetCards.filter((c) => c.rarity === 'Common' && !c.reverseHolo);
    
    // Generate normal pack first: 6 commons, 3 uncommons, 1 hit slot
    const uncommonCount = 3;
    const commonCount = 6; // Always 6 commons for Generations
    const uncommonCards = pick(normalUncommons, uncommonCount);
    const commonCards = pick(normalCommons, commonCount);
    
    // Double Crisis: no reverse holo slot, just commons + uncommons + hit slot
    const finalRhSlot = isDoubleCrisis ? [] : rhSlot;

    // Helper function to replace cards with Radiant Collection cards of same rarity
    const replaceWithRadiant = (basePack) => {
      if (radiantCollectionCards.length === 0) return basePack;
      
      // Select 2 random unique indices to replace
      const packSize = basePack.length;
      const indicesToReplace = [];
      while (indicesToReplace.length < 2) {
        const idx = Math.floor(Math.random() * packSize);
        if (!indicesToReplace.includes(idx)) indicesToReplace.push(idx);
      }
      
      // Replace each selected card with an RC card of the same rarity
      const finalPack = [...basePack];
      indicesToReplace.forEach((idx) => {
        const cardToReplace = basePack[idx];
        const targetRarity = cardToReplace.rarity;
        
        // Find RC cards with matching rarity
        const matchingRcCards = radiantCollectionCards.filter(c => c.rarity === targetRarity);
        
        // If matching RC card exists, replace it
        if (matchingRcCards.length > 0) {
          const replacement = pick(matchingRcCards, 1)[0];
          finalPack[idx] = replacement;
        }
        // If no matching RC card, leave original card
      });
      
      return finalPack;
    };

    // Shiny Pokémon: ~1-in-90 chance, rarer than Secret Rare, replaces the rare slot
    if (normalShinyCards.length > 0 && rollWithMultiplier(1 / 90, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const shinyCard = pick(normalShinyCards, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...shinyCard];
      return replaceWithRadiant(basePack);
    }

    // Secret rare: ~1-in-45 chance, replaces the rare slot
    if (normalSecretRares.length > 0 && rollWithMultiplier(1 / 45, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const secretCard = pick(normalSecretRares, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...secretCard];
      return replaceWithRadiant(basePack);
    }

    // Ultra Rare: ~1-in-18 chance, replaces the rare slot
    // (rarer than EX, less rare than Secret Rare)
    if (normalUltraRares.length > 0 && rollWithMultiplier(1 / 18, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const ultraCard = pick(normalUltraRares, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...ultraCard];
      return replaceWithRadiant(basePack);
    }

    // BREAK cards: ~1-in-5 chance, replaces the rare slot.
    // Less rare than EX, more rare than holo rare.
    if (normalBreakCards.length > 0 && rollWithMultiplier(1 / 5, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const breakCard = pick(normalBreakCards, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...breakCard];
      return replaceWithRadiant(basePack);
    }

    // EX Pokemon: ~1-in-9 chance, replaces the rare slot
    if (normalExCards.length > 0 && rollWithMultiplier(1 / 9, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const exCard = pick(normalExCards, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...exCard];
      return replaceWithRadiant(basePack);
    }

    // ~1-in-3 chance of a holo rare, otherwise a non-holo rare
    // If no plain rares exist (e.g. Gym Heroes), fall back to the holo pool
    const rareCard = hasPlainRares(normalSetCards)
      ? pick(Math.random() < 1 / 3 ? normalHoloRares : normalRares, 1)
      : pick(normalHoloRares.length ? normalHoloRares : normalRares, 1);

    const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...rareCard];
    const finalPack = replaceWithRadiant(basePack);
    
    // Order: commons at the bottom, uncommons in the middle, rare, then reverse holo last
    // For Legendary Collection, reverse holo always goes last
    if (isLegendaryCollection) {
      return finalPack;
    }
    // Standard order: commons, uncommons, [reverse holo], rare on top
    return finalPack;
  }

  const uncommonCount = isLegendaryCollection ? 2 : (isDoubleCrisis ? 3 : 3);
  const commonCount = isLegendaryCollection ? 6 : (isDoubleCrisis ? 3 : (hasRH ? 5 : 6));
  const uncommonCards = pick(uncommons, uncommonCount);
  const commonCards   = pick(commons, commonCount);

  // Double Crisis: no reverse holo slot, just commons + uncommons + hit slot
  const finalRhSlot = isDoubleCrisis ? [] : rhSlot;

  // Shiny Pokémon: ~1-in-90 chance, rarer than Secret Rare, replaces the rare slot
  if (shinyCards.length > 0 && rollWithMultiplier(1 / 90, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    return [...commonCards, ...uncommonCards, ...finalRhSlot, ...pick(shinyCards, 1)];
  }

  // Secret rare: ~1-in-45 chance, replaces the rare slot
  if (secretRares.length > 0 && rollWithMultiplier(1 / 45, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    const secretCard = pick(secretRares, 1);
    return [...commonCards, ...uncommonCards, ...finalRhSlot, ...secretCard];
  }

  // Ultra Rare: ~1-in-18 chance, replaces the rare slot
  // (rarer than EX, less rare than Secret Rare)
  if (ultraRares.length > 0 && rollWithMultiplier(1 / 18, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    const ultraCard = pick(ultraRares, 1);
    return [...commonCards, ...uncommonCards, ...finalRhSlot, ...ultraCard];
  }

  // BREAK cards: ~1-in-5 chance, replaces the rare slot.
  // Less rare than EX, more rare than holo rare.
  if (breakCards.length > 0 && rollWithMultiplier(1 / 5, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    const breakCard = pick(breakCards, 1);
    return [...commonCards, ...uncommonCards, ...finalRhSlot, ...breakCard];
  }

  // EX Pokemon: ~1-in-9 chance, replaces the rare slot
  if (exCards.length > 0 && rollWithMultiplier(1 / 9, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    const exCard = pick(exCards, 1);
    return [...commonCards, ...uncommonCards, ...finalRhSlot, ...exCard];
  }

  // ~1-in-3 chance of a holo rare, otherwise a non-holo rare
  // If no plain rares exist (e.g. Gym Heroes), fall back to the holo pool
  const rareCard = hasPlainRares(allCards)
    ? pick(Math.random() < 1 / 3 ? holoRares : rares, 1)
    : pick(holoRares.length ? holoRares : rares, 1);

  // Order: commons at the bottom, uncommons in the middle, rare, then reverse holo last
  // For Legendary Collection, reverse holo always goes last
  if (isLegendaryCollection) {
    return [...commonCards, ...uncommonCards, ...rareCard, ...finalRhSlot];
  }
  // Standard order: commons, uncommons, [reverse holo], rare on top
  return [...commonCards, ...uncommonCards, ...finalRhSlot, ...rareCard];
}

/**
 * Pity pack — identical to openPack except the rare slot is guaranteed to be
 * at minimum a holo rare. EX Pokémon and Secret Rare still use their normal
 * probabilities so they can still appear (and because holos are now the floor
 * rather than one option among rares, effective pull rates feel higher).
 */
export function openPityPack(allCards, setId = null, options = null) {
  const ownedIds = options instanceof Set ? options : options?.ownedIds ?? null;
  const ownedWeight = options instanceof Set ? 0.8 : options?.ownedWeight ?? 0.8;
  const packSetId = getPackSetId(allCards, setId);
  const cooldownState = getCooldownState(packSetId, !hasPlainRares(allCards));
  const cooldownWasActive = cooldownState?.packsLeft > 0;
  const cooldownMultiplier = getCooldownMultiplier(cooldownState);
  advanceCooldown(cooldownState);
  const holoRares    = allCards.filter((c) => c.rarity === 'Rare' && c.holo === true && !c.reverseHolo);
  const rares        = allCards.filter((c) => c.rarity === 'Rare' && !c.holo && !c.reverseHolo);
  const uncommons    = allCards.filter((c) => c.rarity === 'Uncommon' && !c.reverseHolo);
  const commons      = allCards.filter((c) => c.rarity === 'Common' && !c.reverseHolo);
  const secretRares  = allCards.filter((c) => c.rarity === 'Secret Rare' && !c.reverseHolo);
  const ultraRares   = allCards.filter((c) => c.rarity === 'Ultra Rare' && !c.reverseHolo);
  const breakCards   = allCards.filter((c) => c.rarity === 'Rare BREAK' && !c.reverseHolo);
  const radiantCards = allCards.filter((c) => c.rarity === 'Radiant Rare' && !c.reverseHolo);
  const exCards      = allCards.filter((c) => c.rarity === 'Rare ex' || c.rarity === 'Rare LV.X');
  const shinyCards   = allCards.filter((c) => c.rarity === 'Rare Shiny');
  const reverseHolos = allCards.filter((c) => c.reverseHolo === true);

  // Legendary Collection has special pack composition: 6 commons, 2 uncommons, 1 rare, 1 reverse (last)
  const isLegendaryCollection = packSetId === 'lc';
  // Dragon's Vault has special pack composition: 5 cards, all holo, last card uses standard premium slot
  const isDragonsVault = packSetId === 'dv1';
  // Double Crisis has special pack composition: 6 cards (3 commons, 3 uncommons, hit slot - no reverse)
  const isDoubleCrisis = packSetId === 'dc1';
  // Generations has special pack composition: 10 cards, 2 from Radiant Collection (RC prefix)
  const isGenerations = packSetId === 'g1';
  const hasRH = reverseHolos.length > 0;
  const pick  = (pool, n) => pickWeighted(pool, n, ownedIds, ownedWeight);
  let rhSlot  = hasRH ? pick(reverseHolos, 1) : [];
  if (radiantCards.length > 0 && Math.random() < 1 / 90) {
    rhSlot = pick(radiantCards, 1);
  }

  // Dragon's Vault special pack logic: 5 cards, all holo, last card uses standard premium slot
  if (isDragonsVault) {
    // Dragon's Vault has only Rare and Secret Rare cards, all are effectively holo
    // First 4 cards must be regular Rare cards (no secret rares)
    const dvRegularCards = allCards.filter((c) => !c.reverseHolo && c.rarity !== 'Secret Rare');
    
    // First 4 cards are regular cards (all holo in this set)
    const firstFour = pick(dvRegularCards, 4);
    
    // Last card uses standard premium card logic (secret rare, ultra rare, break, ex, shiny, etc.)
    // Shiny Pokémon: ~1-in-90 chance
    if (shinyCards.length > 0 && rollWithMultiplier(1 / 90, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(shinyCards, 1)];
    }

    // Secret rare: ~1-in-45 chance
    if (secretRares.length > 0 && rollWithMultiplier(1 / 45, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(secretRares, 1)];
    }

    // Ultra Rare: ~1-in-18 chance
    if (ultraRares.length > 0 && rollWithMultiplier(1 / 18, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(ultraRares, 1)];
    }

    // BREAK cards: ~1-in-5 chance
    if (breakCards.length > 0 && rollWithMultiplier(1 / 5, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(breakCards, 1)];
    }

    // EX Pokemon: ~1-in-9 chance
    if (exCards.length > 0 && rollWithMultiplier(1 / 9, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      return [...firstFour, ...pick(exCards, 1)];
    }

    // Default to regular card if no premium hit
    return [...firstFour, ...pick(dvRegularCards, 1)];
  }

  // Generations special pack logic: 10 cards, 2 from Radiant Collection (RC prefix)
  if (isGenerations) {
    // Radiant Collection cards have localId starting with 'RC'
    const radiantCollectionCards = allCards.filter((c) => String(c.localId).startsWith('RC') && !c.reverseHolo);
    
    // Exclude RC cards from all pools to ensure base pack is from normal set only
    const normalSetCards = allCards.filter((c) => !String(c.localId).startsWith('RC'));
    const normalShinyCards = normalSetCards.filter((c) => c.rarity === 'Rare Shiny');
    const normalSecretRares = normalSetCards.filter((c) => c.rarity === 'Secret Rare');
    const normalUltraRares = normalSetCards.filter((c) => c.rarity === 'Ultra Rare');
    const normalBreakCards = normalSetCards.filter((c) => c.rarity === 'Rare BREAK' && !c.reverseHolo);
    const normalExCards = normalSetCards.filter((c) => c.rarity === 'Rare ex' || c.rarity === 'Rare LV.X');
    const normalHoloRares = normalSetCards.filter((c) => c.holo === true && c.rarity !== 'Secret Rare' && !c.reverseHolo);
    const normalRares = normalSetCards.filter((c) => c.rarity === 'Rare' && !c.holo && !c.reverseHolo);
    const normalUncommons = normalSetCards.filter((c) => c.rarity === 'Uncommon' && !c.reverseHolo);
    const normalCommons = normalSetCards.filter((c) => c.rarity === 'Common' && !c.reverseHolo);
    
    // Generate normal pack first: 6 commons, 3 uncommons, 1 hit slot
    const uncommonCount = 3;
    const commonCount = 6; // Always 6 commons for Generations
    const uncommonCards = pick(normalUncommons, uncommonCount);
    const commonCards = pick(normalCommons, commonCount);
    
    // Double Crisis: no reverse holo slot, just commons + uncommons + hit slot
    const finalRhSlot = isDoubleCrisis ? [] : rhSlot;

    // Helper function to replace cards with Radiant Collection cards of same rarity
    const replaceWithRadiant = (basePack) => {
      if (radiantCollectionCards.length === 0) return basePack;
      
      // Select 2 random unique indices to replace
      const packSize = basePack.length;
      const indicesToReplace = [];
      while (indicesToReplace.length < 2) {
        const idx = Math.floor(Math.random() * packSize);
        if (!indicesToReplace.includes(idx)) indicesToReplace.push(idx);
      }
      
      // Replace each selected card with an RC card of the same rarity
      const finalPack = [...basePack];
      indicesToReplace.forEach((idx) => {
        const cardToReplace = basePack[idx];
        const targetRarity = cardToReplace.rarity;
        
        // Find RC cards with matching rarity
        const matchingRcCards = radiantCollectionCards.filter(c => c.rarity === targetRarity);
        
        // If matching RC card exists, replace it
        if (matchingRcCards.length > 0) {
          const replacement = pick(matchingRcCards, 1)[0];
          finalPack[idx] = replacement;
        }
        // If no matching RC card, leave original card
      });
      
      return finalPack;
    };

    // Shiny Pokémon: ~1-in-90 chance, rarer than Secret Rare, replaces the rare slot
    if (normalShinyCards.length > 0 && rollWithMultiplier(1 / 90, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const shinyCard = pick(normalShinyCards, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...shinyCard];
      return replaceWithRadiant(basePack);
    }

    // Secret rare: ~1-in-45 chance, replaces the rare slot
    if (normalSecretRares.length > 0 && rollWithMultiplier(1 / 45, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const secretCard = pick(normalSecretRares, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...secretCard];
      return replaceWithRadiant(basePack);
    }

    // Ultra Rare: ~1-in-18 chance, replaces the rare slot
    // (rarer than EX, less rare than Secret Rare)
    if (normalUltraRares.length > 0 && rollWithMultiplier(1 / 18, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const ultraCard = pick(normalUltraRares, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...ultraCard];
      return replaceWithRadiant(basePack);
    }

    // BREAK cards: ~1-in-5 chance, replaces the rare slot.
    // Less rare than EX, more rare than holo rare.
    if (normalBreakCards.length > 0 && rollWithMultiplier(1 / 5, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const breakCard = pick(normalBreakCards, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...breakCard];
      return replaceWithRadiant(basePack);
    }

    // EX Pokemon: ~1-in-9 chance, replaces the rare slot
    if (normalExCards.length > 0 && rollWithMultiplier(1 / 9, cooldownMultiplier)) {
      notePremiumHit(cooldownState, cooldownWasActive);
      const exCard = pick(normalExCards, 1);
      const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...exCard];
      return replaceWithRadiant(basePack);
    }

    // ~1-in-3 chance of a holo rare, otherwise a non-holo rare
    // If no plain rares exist (e.g. Gym Heroes), fall back to the holo pool
    const rareCard = hasPlainRares(normalSetCards)
      ? pick(Math.random() < 1 / 3 ? normalHoloRares : normalRares, 1)
      : pick(normalHoloRares.length ? normalHoloRares : normalRares, 1);

    const basePack = [...commonCards, ...uncommonCards, ...finalRhSlot, ...rareCard];
    const finalPack = replaceWithRadiant(basePack);
    
    // Order: commons at the bottom, uncommons in the middle, rare, then reverse holo last
    // For Legendary Collection, reverse holo always goes last
    if (isLegendaryCollection) {
      return finalPack;
    }
    // Standard order: commons, uncommons, [reverse holo], rare on top
    return finalPack;
  }

  const uncommonCount = isLegendaryCollection ? 2 : (isDoubleCrisis ? 3 : 3);
  const commonCount = isLegendaryCollection ? 6 : (isDoubleCrisis ? 3 : (hasRH ? 5 : 6));
  const uncommonCards = pick(uncommons, uncommonCount);
  const commonCards   = pick(commons, commonCount);

  // Double Crisis: no reverse holo slot, just commons + uncommons + hit slot
  const finalRhSlot = isDoubleCrisis ? [] : rhSlot;

  // Shiny Pokémon: same 1-in-90 chance
  if (shinyCards.length > 0 && rollWithMultiplier(1 / 90, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    return [...commonCards, ...uncommonCards, ...rhSlot, ...pick(shinyCards, 1)];
  }

  // Secret Rare: same 1-in-45 chance
  if (secretRares.length > 0 && rollWithMultiplier(1 / 45, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    return [...commonCards, ...uncommonCards, ...rhSlot, ...pick(secretRares, 1)];
  }

  // Ultra Rare: same 1-in-18 chance
  if (ultraRares.length > 0 && rollWithMultiplier(1 / 18, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    return [...commonCards, ...uncommonCards, ...rhSlot, ...pick(ultraRares, 1)];
  }

  // BREAK cards: same 1-in-5 chance in pity packs.
  if (breakCards.length > 0 && rollWithMultiplier(1 / 5, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    return [...commonCards, ...uncommonCards, ...rhSlot, ...pick(breakCards, 1)];
  }

  // EX Pokémon: same 1-in-9 chance
  if (exCards.length > 0 && rollWithMultiplier(1 / 9, cooldownMultiplier)) {
    notePremiumHit(cooldownState, cooldownWasActive);
    return [...commonCards, ...uncommonCards, ...rhSlot, ...pick(exCards, 1)];
  }

  // Guaranteed holo (fall back to non-holo rares only if the set has none)
  const pool = hasPlainRares(allCards)
    ? holoRares
    : (holoRares.length > 0 ? holoRares : rares);
  const rareCard = pick(pool, 1);

  // For Legendary Collection, reverse holo always goes last
  if (isLegendaryCollection) {
    return [...commonCards, ...uncommonCards, ...rareCard, ...rhSlot];
  }
  return [...commonCards, ...uncommonCards, ...rhSlot, ...rareCard];
}
