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

export function getEconomyDifficultyChangeCost(currentId, nextId) {
  const current = ECONOMY_DIFFICULTIES[currentId];
  const next = ECONOMY_DIFFICULTIES[nextId];
  if (!current || !next) return 0;
  if (next.rank >= current.rank) return 0;
  return (current.rank - next.rank) * EASIER_STEP_COST;
}
