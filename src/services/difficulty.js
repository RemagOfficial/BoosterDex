export const SANDBOX_DIFFICULTIES = {
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'Default sandbox pull behavior.',
    ownedCardWeight: null,
  },
  collector: {
    id: 'collector',
    label: 'Collector',
    description: 'Less likely to pull cards you already own.',
    ownedCardWeight: 0.55,
  },
};

export const ECONOMY_DIFFICULTIES = {
  cheaper: {
    id: 'cheaper',
    label: 'Cheaper',
    description: 'Cards sell for more, so progression feels easier.',
    sellMultiplier: 1.25,
    rank: 0,
  },
  regular: {
    id: 'regular',
    label: 'Regular',
    description: 'Default economy pricing and sell values.',
    sellMultiplier: 1,
    rank: 1,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    description: 'Cards sell for less; duplicate packs may lose coins.',
    sellMultiplier: 0.7,
    rank: 2,
  },
};

export const DEFAULT_DIFFICULTY_BY_MODE = {
  sandbox: 'standard',
  economy: 'regular',
};

export const DIFFICULTY_PROFILES_KEY = 'pkmon_difficulty_profiles';

const EASIER_STEP_COST = 200;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getEconomyDifficultyCostMultiplier(progress = null) {
  const overrideMultiplier = Number(progress?.multiplierOverride);
  if (Number.isFinite(overrideMultiplier) && overrideMultiplier >= 1) {
    return Math.floor(overrideMultiplier);
  }

  const ownedCards = Number(progress?.ownedCards ?? 0);
  const totalCards = Number(progress?.totalCards ?? 0);
  if (!Number.isFinite(ownedCards) || ownedCards <= 0 || !Number.isFinite(totalCards) || totalCards <= 0) {
    return 1;
  }

  const ratio = clamp01(ownedCards / totalCards);
  // Aggressive late-game scaling:
  // - early game stays forgiving via linear growth
  // - near completion ramps exponentially so easier switches stay expensive
  const linearMultiplier = 1 + Math.floor(ratio * 20);
  const endgameMultiplier = Math.max(1, Math.floor(10 ** (Math.pow(ratio, 3) * 9)));
  return Math.max(linearMultiplier, endgameMultiplier);
}

export function normalizeDifficultyProfiles(input) {
  const next = {
    sandbox: DEFAULT_DIFFICULTY_BY_MODE.sandbox,
    economy: DEFAULT_DIFFICULTY_BY_MODE.economy,
  };

  if (input && typeof input === 'object') {
    if (input.sandbox && SANDBOX_DIFFICULTIES[input.sandbox]) {
      next.sandbox = input.sandbox;
    }
    if (input.economy && ECONOMY_DIFFICULTIES[input.economy]) {
      next.economy = input.economy;
    }
  }

  return next;
}

export function getEconomyDifficultyChangeCost(currentId, nextId, progress = null) {
  const current = ECONOMY_DIFFICULTIES[currentId];
  const next = ECONOMY_DIFFICULTIES[nextId];
  if (!current || !next) return 0;
  if (next.rank >= current.rank) return 0;
  const steps = current.rank - next.rank;
  const progressMultiplier = getEconomyDifficultyCostMultiplier(progress);
  return steps * EASIER_STEP_COST * progressMultiplier;
}
