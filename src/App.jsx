import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import PackOpener from './components/PackOpener.jsx';
import Collection from './components/Collection.jsx';
import Achievements from './components/Achievements.jsx';
import SetSelector from './components/SetSelector.jsx';
import Showcase from './components/Showcase.jsx';
import Stats from './components/Stats.jsx';
import { useCollection } from './hooks/useCollection.js';
import { useEconomy } from './hooks/useEconomy.js';
import { loadSetCards, loadAllSetSymbols } from './services/tcgdex.js';
import { cacheClearAll } from './services/cache.js';
import { SETS } from './services/sets.js';
import { PACK_PRICES, getSellPrice, STARTING_BALANCE, BOOSTER_BOX_SIZE, BOOSTER_BOX_MULTIPLIER } from './services/economy.js';
import { ACHIEVEMENT_SETS, computeProgress, getAchievementReward } from './services/achievements.js';
import {
  SANDBOX_DIFFICULTIES,
  ECONOMY_DIFFICULTIES,
  DEFAULT_DIFFICULTY_BY_MODE,
  DIFFICULTY_PROFILES_KEY,
  normalizeDifficultyProfiles,
  getEconomyDifficultyChangeCost,
} from './services/difficulty.js';
import { getAllStats, resetStats, recordSetCompletion } from './services/stats.js';
import { encryptSavePayload, decryptSavePayload, downloadSaveObject, readTextFile } from './services/saveTransfer.js';
import Settings from './components/Settings.jsx';
import CoinFlip from './components/CoinFlip.jsx';
import AchToast from './components/AchToast.jsx';
import DevPanel from './components/DevPanel.jsx';
import Tutorial from './components/Tutorial.jsx';
import './App.css';

const BOOSTERDEX_MAIN_SET_ID = '__boosterdex_main__';
const BOOSTERDEX_SPECIAL_SET_ID = '__boosterdex_special__';
const ECON_OPENED_KEY = 'pkmon_eco_opened_sets';
const LEGACY_CLAIMED_ACH_KEY = 'pkmon_claimed_ach';

function getClaimedAchievementsKey(mode) {
  return mode === 'economy' ? 'pkmon_claimed_ach_economy' : 'pkmon_claimed_ach_sandbox';
}

function getFavouritesKey(mode) {
  return mode === 'economy' ? 'pkmon_favourites_economy' : 'pkmon_favourites_sandbox';
}

function getStatsKey(mode) {
  return mode === 'economy' ? 'pkmon_stats_economy' : 'pkmon_stats_sandbox';
}

function getCollectionKey(mode) {
  return mode === 'economy' ? 'pkmon_eco_collection' : 'pokemon_collection';
}

function loadClaimedAchievements(mode) {
  try {
    const modeKey = getClaimedAchievementsKey(mode);
    const modeRaw = localStorage.getItem(modeKey);
    if (modeRaw) {
      return new Set(JSON.parse(modeRaw));
    }
    // Legacy migration path: old claimed achievements were shared.
    const legacyRaw = localStorage.getItem(LEGACY_CLAIMED_ACH_KEY);
    if (legacyRaw && mode === 'sandbox') {
      localStorage.setItem(modeKey, legacyRaw);
      return new Set(JSON.parse(legacyRaw));
    }
  } catch {
    // ignore
  }
  return new Set();
}

function loadDifficultyProfiles() {
  try {
    const raw = localStorage.getItem(DIFFICULTY_PROFILES_KEY);
    if (!raw) return normalizeDifficultyProfiles(null);
    return normalizeDifficultyProfiles(JSON.parse(raw));
  } catch {
    return normalizeDifficultyProfiles(null);
  }
}

function isSpecialExpansion(set) {
  return set?.expansionGroup === 'special';
}

const MAIN_SET_IDS = SETS.filter((set) => !isSpecialExpansion(set)).map((set) => set.id);
const SPECIAL_SET_IDS = SETS.filter((set) => isSpecialExpansion(set)).map((set) => set.id);
const TOTAL_COLLECTION_PROGRESS_CARDS = SETS.reduce((sum, set) => sum + (Number(set.totalCards) || 0), 0);

const BOOSTERDEX_MAIN_PACK_PRICE = (() => {
  const mainPrices = MAIN_SET_IDS.map((id) => PACK_PRICES[id] ?? PACK_PRICES.base1).filter(Boolean);
  const maxMainPack = mainPrices.length > 0 ? Math.max(...mainPrices) : (PACK_PRICES.base1 ?? 100);
  return Math.ceil((maxMainPack * 2) / 10) * 10;
})();

const BOOSTERDEX_SPECIAL_PACK_PRICE = (() => {
  const specialPrices = SPECIAL_SET_IDS.map((id) => PACK_PRICES[id] ?? PACK_PRICES.base1).filter(Boolean);
  const maxSpecialPack = specialPrices.length > 0 ? Math.max(...specialPrices) : (PACK_PRICES.base1 ?? 100);
  return Math.ceil((maxSpecialPack * 2) / 10) * 10;
})();

function loadEcoOpenedSetIds() {
  try {
    const raw = localStorage.getItem(ECON_OPENED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function saveEcoOpenedSetIds(nextSetIds) {
  try { localStorage.setItem(ECON_OPENED_KEY, JSON.stringify([...nextSetIds])); } catch { /* ignore */ }
}

function readCachedSetCardsById() {
  const bySetId = {};
  const prefix = 'pkmon_cache_set_';
  const now = Date.now();
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const match = key.match(/^pkmon_cache_set_([^_]+)_cards_/);
      if (!match) continue;
      const setId = match[1];
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const expires = parsed.expires;
      if (typeof expires === 'number' && now > expires) continue;
      const data = parsed.data;
      if (!Array.isArray(data) || data.length === 0) continue;
      // Keep the largest valid cache entry if multiple versions exist.
      if (!bySetId[setId] || bySetId[setId].length < data.length) {
        bySetId[setId] = data;
      }
    }
  } catch {
    return {};
  }
  return bySetId;
}

// Persist + restore the last-selected set id
function loadSavedSetId() {
  try {
    const saved = localStorage.getItem('pokemon_selected_set') ?? null;
    return saved === '__boosterdex__' ? BOOSTERDEX_MAIN_SET_ID : saved;
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState('pack');
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const [economyCounterMode, setEconomyCounterMode] = useState('coins');

  const viewNames = {
    pack: 'Open Packs',
    collection: 'Collection',
    achievements: 'Achievements',
    showcase: 'Showcase',
    stats: 'Stats',
  };

  // ── Per-set card cache ─────────────────────────────────────────────────────
  // loadedSets: { [setId]: cards[] }  — stored in state so re-renders fire
  const [loadedSets, setLoadedSets] = useState({});
  const [setSymbols, setSetSymbols] = useState({});
  const [selectedSetId, setSelectedSetId] = useState(loadSavedSetId);
  const [setLoading, setSetLoading] = useState(false);
  const [setError, setSetError] = useState(null);
  // Tracks whether we've already triggered the auto-load on mount
  const didInitialLoad = useRef(false);

  const cachedSetCardsById = useMemo(
    () => readCachedSetCardsById(),
    [loadedSets],
  );

  const boosterDexMainCards = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const allowed = new Set(MAIN_SET_IDS);
    const pushUnique = (card) => {
      if (!card || !card.id || seen.has(card.id)) return;
      seen.add(card.id);
      merged.push(card);
    };

    for (const [setId, setCards] of Object.entries(loadedSets)) {
      if (!allowed.has(setId)) continue;
      for (const card of setCards) pushUnique(card);
    }

    for (const [setId, setCards] of Object.entries(cachedSetCardsById)) {
      if (!allowed.has(setId) || loadedSets[setId]) continue;
      for (const card of setCards) pushUnique(card);
    }

    return merged;
  }, [loadedSets, cachedSetCardsById]);

  const boosterDexSpecialCards = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const allowed = new Set(SPECIAL_SET_IDS);
    const pushUnique = (card) => {
      if (!card || !card.id || seen.has(card.id)) return;
      seen.add(card.id);
      merged.push(card);
    };

    for (const [setId, setCards] of Object.entries(loadedSets)) {
      if (!allowed.has(setId)) continue;
      for (const card of setCards) pushUnique(card);
    }

    for (const [setId, setCards] of Object.entries(cachedSetCardsById)) {
      if (!allowed.has(setId) || loadedSets[setId]) continue;
      for (const card of setCards) pushUnique(card);
    }

    return merged;
  }, [loadedSets, cachedSetCardsById]);

  const boosterDexMainSetCount = useMemo(() => {
    const allowed = new Set(MAIN_SET_IDS);
    const ids = new Set([
      ...Object.keys(cachedSetCardsById).filter((id) => allowed.has(id)),
      ...Object.keys(loadedSets).filter((id) => allowed.has(id)),
    ]);
    return ids.size;
  }, [loadedSets, cachedSetCardsById]);

  const boosterDexSpecialSetCount = useMemo(() => {
    const allowed = new Set(SPECIAL_SET_IDS);
    const ids = new Set([
      ...Object.keys(cachedSetCardsById).filter((id) => allowed.has(id)),
      ...Object.keys(loadedSets).filter((id) => allowed.has(id)),
    ]);
    return ids.size;
  }, [loadedSets, cachedSetCardsById]);

  const isBoosterDexMainSelected = selectedSetId === BOOSTERDEX_MAIN_SET_ID;
  const isBoosterDexSpecialSelected = selectedSetId === BOOSTERDEX_SPECIAL_SET_ID;
  const isBoosterDexSelected = isBoosterDexMainSelected || isBoosterDexSpecialSelected;

  // Cards for the currently-selected set (null if none / loading)
  const currentSetCards = isBoosterDexMainSelected
    ? boosterDexMainCards
    : isBoosterDexSpecialSelected
      ? boosterDexSpecialCards
      : (selectedSetId ? (loadedSets[selectedSetId] ?? null) : null);
  const currentSetConfig = isBoosterDexMainSelected
    ? { id: BOOSTERDEX_MAIN_SET_ID, name: 'BoosterDex Mega Pack (Main)' }
    : isBoosterDexSpecialSelected
      ? { id: BOOSTERDEX_SPECIAL_SET_ID, name: 'BoosterDex Mega Pack (Special)' }
    : (SETS.find((s) => s.id === selectedSetId) ?? null);

  const loadSet = useCallback(async (setId) => {
    // Already cached — nothing to fetch
    if (loadedSets[setId]) return;
    setSetLoading(true);
    setSetError(null);
    try {
      const cards = await loadSetCards(setId);
      setLoadedSets((prev) => ({ ...prev, [setId]: cards }));
    } catch (err) {
      setSetError(err.message ?? 'Failed to load set');
    } finally {
      setSetLoading(false);
    }
  }, [loadedSets]);

  // Auto-load the saved set on first mount
  useEffect(() => {
    if (!didInitialLoad.current && selectedSetId) {
      didInitialLoad.current = true;
      if (selectedSetId !== BOOSTERDEX_MAIN_SET_ID && selectedSetId !== BOOSTERDEX_SPECIAL_SET_ID) {
        loadSet(selectedSetId);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load set symbol URLs in the background on first mount
  useEffect(() => {
    loadAllSetSymbols().then(setSetSymbols).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSet = useCallback(async (setId) => {
    setSelectedSetId(setId);
    try { localStorage.setItem('pokemon_selected_set', setId); } catch { /* ignore */ }
    if (setId === BOOSTERDEX_MAIN_SET_ID || setId === BOOSTERDEX_SPECIAL_SET_ID) return;
    await loadSet(setId);
  }, [loadSet]);

  // ── Game mode ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('pkmon_mode') ?? 'sandbox'; } catch { return 'sandbox'; }
  });
  const [difficultyProfiles, setDifficultyProfiles] = useState(loadDifficultyProfiles);
  const economyMode = mode === 'economy';
  const sandboxDifficultyId = difficultyProfiles.sandbox;
  const economyDifficultyId = difficultyProfiles.economy;
  const sandboxPullWeight = SANDBOX_DIFFICULTIES[sandboxDifficultyId]?.ownedCardWeight ?? null;
  const economySellMultiplier = ECONOMY_DIFFICULTIES[economyDifficultyId]?.sellMultiplier ?? 1;
  const [devDifficultyCostMultiplierOverride, setDevDifficultyCostMultiplierOverride] = useState(null);
  const [ecoOpenedSetIds, setEcoOpenedSetIds] = useState(loadEcoOpenedSetIds);
  const boosterDexMainUnlocked = useMemo(
    () => MAIN_SET_IDS.every((id) => ecoOpenedSetIds.has(id)),
    [ecoOpenedSetIds],
  );
  const boosterDexSpecialUnlocked = useMemo(
    () => (SPECIAL_SET_IDS.length === 0 ? true : SPECIAL_SET_IDS.every((id) => ecoOpenedSetIds.has(id))),
    [ecoOpenedSetIds],
  );
  const boosterDexMainProgress = useMemo(
    () => MAIN_SET_IDS.reduce((sum, id) => sum + (ecoOpenedSetIds.has(id) ? 1 : 0), 0),
    [ecoOpenedSetIds],
  );
  const boosterDexSpecialProgress = useMemo(
    () => SPECIAL_SET_IDS.reduce((sum, id) => sum + (ecoOpenedSetIds.has(id) ? 1 : 0), 0),
    [ecoOpenedSetIds],
  );

  // Separate collections per mode so economy players can't sell sandbox cards
  const sandboxCol = useCollection('pokemon_collection');
  const economyCol = useCollection('pkmon_eco_collection');
  const { collection, addCards, sellCard, gradeCard, devSetCardGrade, resetCollection } = economyMode ? economyCol : sandboxCol;
  const economyDifficultyCostContext = useMemo(() => ({
    ownedCards: economyCol.collection.length,
    totalCards: TOTAL_COLLECTION_PROGRESS_CARDS,
    multiplierOverride: devDifficultyCostMultiplierOverride,
  }), [devDifficultyCostMultiplierOverride, economyCol.collection.length]);

  // All cards from every loaded set combined — fed to Achievements.
  // We also include collection cards for sets that haven't been loaded yet so
  // that achievement progress is correct across sessions without requiring every
  // set to be fetched from the API on startup.
  const allLoadedCards = useMemo(() => {
    const loaded = Object.values(loadedSets).flat();
    const loadedSetIds = new Set(Object.keys(loadedSets));
    const extra = collection.filter((c) => c.setId && !loadedSetIds.has(c.setId));
    return [...loaded, ...extra];
  }, [loadedSets, collection]);

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    try { localStorage.setItem('pkmon_mode', newMode); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(DIFFICULTY_PROFILES_KEY, JSON.stringify(difficultyProfiles)); } catch { /* ignore */ }
  }, [difficultyProfiles]);

  useEffect(() => {
    if (!economyMode || !isBoosterDexSelected) return;
    if (isBoosterDexMainSelected && boosterDexMainUnlocked) return;
    if (isBoosterDexSpecialSelected && boosterDexSpecialUnlocked) return;
    setSelectedSetId(null);
    try { localStorage.removeItem('pokemon_selected_set'); } catch { /* ignore */ }
  }, [economyMode, isBoosterDexSelected, isBoosterDexMainSelected, isBoosterDexSpecialSelected, boosterDexMainUnlocked, boosterDexSpecialUnlocked]);

  // ── Economy (coins) ──────────────────────────────────────────────────────
  const { coins, spend, earn, setBalance: setCoins, reset: resetCoins } = useEconomy();
  const [showCoinFlip, setShowCoinFlip] = useState(false);

  const changeDifficulty = useCallback((targetMode, nextDifficultyId, options = {}) => {
    const skipCost = options?.skipCost === true;
    if (targetMode === 'sandbox') {
      if (!SANDBOX_DIFFICULTIES[nextDifficultyId]) {
        return { ok: false, message: 'Invalid sandbox difficulty.' };
      }
      if (difficultyProfiles.sandbox === nextDifficultyId) {
        return { ok: true, cost: 0, message: null };
      }
      setDifficultyProfiles((prev) => ({ ...prev, sandbox: nextDifficultyId }));
      return { ok: true, cost: 0, message: null };
    }

    if (targetMode === 'economy') {
      if (!ECONOMY_DIFFICULTIES[nextDifficultyId]) {
        return { ok: false, message: 'Invalid economy difficulty.' };
      }
      if (difficultyProfiles.economy === nextDifficultyId) {
        return { ok: true, cost: 0, message: null };
      }

      const cost = (!skipCost && mode === 'economy')
        ? getEconomyDifficultyChangeCost(difficultyProfiles.economy, nextDifficultyId, economyDifficultyCostContext)
        : 0;

      if (cost > coins) {
        return { ok: false, message: `Need ${cost.toLocaleString()} coins to switch to an easier difficulty.` };
      }

      if (cost > 0) spend(cost);
      setDifficultyProfiles((prev) => ({ ...prev, economy: nextDifficultyId }));
      return { ok: true, cost, message: null };
    }

    return { ok: false, message: 'Invalid mode.' };
  }, [coins, difficultyProfiles.economy, difficultyProfiles.sandbox, economyDifficultyCostContext, mode, spend]);

  // Free pack tokens per set: { [setId]: count }
  const [freePacks, setFreePacks] = useState(() => {
    try {
      const raw = localStorage.getItem('pkmon_free_packs');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // Migrate old global-number format back to per-set (put on base1 as fallback)
      if (typeof parsed === 'number') return parsed > 0 ? { base1: parsed } : {};
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch { return {}; }
  });

  const awardFreePack = useCallback((setId) => {
    setFreePacks((prev) => {
      const next = { ...prev, [setId]: (prev[setId] ?? 0) + 1 };
      try { localStorage.setItem('pkmon_free_packs', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const consumeFreePack = useCallback((setId) => {
    setFreePacks((prev) => {
      const count = (prev[setId] ?? 0) - 1;
      const next = { ...prev };
      if (count <= 0) delete next[setId]; else next[setId] = count;
      try { localStorage.setItem('pkmon_free_packs', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // All set IDs the player already has at least one card from (for random pack awards)
    const handleBuyBox = useCallback(() => {
      if (!selectedSetId || isBoosterDexSelected) return;
      const price = (PACK_PRICES[selectedSetId] ?? PACK_PRICES['base1']) * BOOSTER_BOX_MULTIPLIER;
      spend(price);
      for (let i = 0; i < BOOSTER_BOX_SIZE; i++) awardFreePack(selectedSetId);
    }, [selectedSetId, isBoosterDexSelected, spend, awardFreePack]);

    // All set IDs the player already has at least one card from (for random pack awards)
  const setsWithCards = useMemo(
    () => [...new Set(collection.map((c) => c.setId).filter(Boolean))],
    [collection],
  );

  // ── Pity counters (economy mode) ──────────────────────────────────────────
  const [pityCounters, setPityCounters] = useState(() => {
    try {
      const raw = localStorage.getItem('pkmon_pity');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const handlePityUpdate = useCallback((hasHit) => {
    if (!selectedSetId) return;
    setPityCounters((prev) => {
      const next = { ...prev, [selectedSetId]: hasHit ? 0 : (prev[selectedSetId] ?? 0) + 1 };
      try { localStorage.setItem('pkmon_pity', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [selectedSetId]);

  // Sets the player already has cards from that are also currently loaded
  const eligibleFlipSets = useMemo(() => {
    if (!economyMode) return [];
    return Object.keys(loadedSets).filter((setId) => collection.some((c) => c.setId === setId));
  }, [economyMode, loadedSets, collection]);

  const hasDuplicates = useMemo(() => collection.some((c) => c.count > 1), [collection]);
  const hasFreePacksAny = useMemo(() => Object.values(freePacks).some((v) => v > 0), [freePacks]);

  // "Truly broke": can't afford even the cheapest pack, nothing to sell, and no free packs
  const canCoinFlip = economyMode
    && eligibleFlipSets.length > 0
    && coins < PACK_PRICES['base1']
    && !hasDuplicates
    && !hasFreePacksAny;

  // ── Set completion reward ──────────────────────────────────────────────────
  // Tracks per-set owned counts so the modal fires only on the transition
  const [setComplete,     setSetComplete]     = useState(false);
  const [setCompleteName, setSetCompleteName] = useState('');
  const [setCompleteTotal, setSetCompleteTotal] = useState(0);
  const prevOwnedPerSet = useRef({});
  const completedSetIdsRef = useRef(
    new Set(
      Object.entries(getAllStats())
        .filter(([, stats]) => stats?.packsAtCompletion != null)
        .map(([setId]) => setId)
    )
  );

  useEffect(() => {
    const ownedIds = new Set(collection.map((c) => c.id));
    for (const [setId, setCards] of Object.entries(loadedSets)) {
      const currentOwned = setCards.filter((c) => ownedIds.has(c.id)).length;
      const prevOwned = prevOwnedPerSet.current[setId] ?? 0;
      const alreadyCompleted = completedSetIdsRef.current.has(setId);
      if (prevOwned < setCards.length && currentOwned >= setCards.length && !alreadyCompleted) {
        const cfg = SETS.find((s) => s.id === setId);
        setSetCompleteName(cfg?.name ?? setId);
        setSetCompleteTotal(setCards.length);
        setSetComplete(true);
        recordSetCompletion(setId);
        completedSetIdsRef.current.add(setId);
      }
      prevOwnedPerSet.current[setId] = currentOwned;
    }
  }, [collection, loadedSets]);

  // ── Achievement pack rewards (economy mode) ────────────────────────────────
  const [claimedAchievements, setClaimedAchievements] = useState(() => {
    return loadClaimedAchievements(mode);
  });
  const [achToasts, setAchToasts] = useState([]);
  const prevAchievementCompleteRef = useRef(new Set());
  const achTrackingArmedRef = useRef(false);

  const dismissAchToast = useCallback((id) => {
    setAchToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const applyAchievementClaims = useCallback((claims, { showToasts = true } = {}) => {
    if (!Array.isArray(claims) || claims.length === 0) {
      return { claimedCount: 0, packsAwarded: 0 };
    }

    const eligibleIds = setsWithCards.length > 0 ? setsWithCards : ['base1'];
    const newToasts = [];
    let packsAwarded = 0;

    for (const { ach, setName } of claims) {
      let packs = 0;
      if (economyMode) {
        packs = getAchievementReward(ach);
        packsAwarded += packs;
        for (let i = 0; i < packs; i++) {
          const randomSetId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
          awardFreePack(randomSetId);
        }
      }
      if (showToasts && ach.rarity !== null) {
        newToasts.push({ id: ach.id, title: ach.title, icon: ach.icon, rarity: ach.rarity, setName, packs });
      }
    }

    if (newToasts.length > 0) {
      setAchToasts((prev) => [...prev, ...newToasts]);
    }

    setClaimedAchievements((prev) => {
      const next = new Set(prev);
      for (const { ach } of claims) next.add(ach.id);
      return next;
    });

    return { claimedCount: claims.length, packsAwarded };
  }, [awardFreePack, economyMode, setsWithCards]);

  const armAchievementTracking = useCallback(() => {
    if (achTrackingArmedRef.current || !allLoadedCards.length) return;
    const progress = computeProgress(allLoadedCards, collection);
    const baselineCompleteIds = new Set();
    for (const achSet of ACHIEVEMENT_SETS) {
      for (const ach of achSet.achievements) {
        if (progress.get(ach.id)?.complete) {
          baselineCompleteIds.add(ach.id);
        }
      }
    }
    prevAchievementCompleteRef.current = baselineCompleteIds;
    achTrackingArmedRef.current = true;
  }, [allLoadedCards, collection]);

  useEffect(() => {
    try { localStorage.setItem(getClaimedAchievementsKey(mode), JSON.stringify([...claimedAchievements])); } catch { /* ignore */ }
  }, [claimedAchievements, mode]);

  useEffect(() => {
    setClaimedAchievements(loadClaimedAchievements(mode));
    prevAchievementCompleteRef.current = new Set();
    achTrackingArmedRef.current = false;
  }, [mode]);

  useEffect(() => {
    if (!achTrackingArmedRef.current) return;
    if (!allLoadedCards.length) return;
    const progress = computeProgress(allLoadedCards, collection);
    const currentCompleteIds = new Set();
    const newClaims = [];

    for (const achSet of ACHIEVEMENT_SETS) {
      for (const ach of achSet.achievements) {
        const prog = progress.get(ach.id);
        if (prog?.complete) {
          currentCompleteIds.add(ach.id);
        }
        const wasComplete = prevAchievementCompleteRef.current.has(ach.id);
        if (prog?.complete && !wasComplete && !claimedAchievements.has(ach.id)) {
          newClaims.push({ ach, setName: achSet.name });
        }
      }
    }

    prevAchievementCompleteRef.current = currentCompleteIds;
    if (newClaims.length === 0) return;
    applyAchievementClaims(newClaims, { showToasts: true });
  // claimedAchievements intentionally omitted — we only re-run on collection/cards change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, allLoadedCards, applyAchievementClaims]);

  const recheckAchievements = useCallback(() => {
    if (!allLoadedCards.length) {
      return { claimedCount: 0, packsAwarded: 0 };
    }

    const progress = computeProgress(allLoadedCards, collection);
    const currentCompleteIds = new Set();
    const missingClaimsById = new Map();

    // If a set is fully complete, force-grant every achievement in that set.
    // For sets with variant achievements, this requires full all-variants completion.
    for (const achSet of ACHIEVEMENT_SETS) {
      if (achSet.id === 'global') continue;
      const allVariantAchievement = achSet.achievements.find((ach) => ach.rarity === 'all-variants');
      const completionAchievement = allVariantAchievement
        ?? achSet.achievements.find((ach) => ach.rarity === null);
      const setFullyComplete = completionAchievement
        ? Boolean(progress.get(completionAchievement.id)?.complete)
        : false;
      if (!setFullyComplete) continue;

      for (const ach of achSet.achievements) {
        if (claimedAchievements.has(ach.id)) continue;
        missingClaimsById.set(ach.id, { ach, setName: achSet.name });
      }
    }

    for (const achSet of ACHIEVEMENT_SETS) {
      for (const ach of achSet.achievements) {
        const complete = progress.get(ach.id)?.complete;
        if (!complete) continue;
        currentCompleteIds.add(ach.id);
        if (!claimedAchievements.has(ach.id)) {
          missingClaimsById.set(ach.id, { ach, setName: achSet.name });
        }
      }
    }

    prevAchievementCompleteRef.current = currentCompleteIds;
    achTrackingArmedRef.current = true;

    return applyAchievementClaims([...missingClaimsById.values()], { showToasts: false });
  }, [allLoadedCards, applyAchievementClaims, claimedAchievements, collection]);

  // ── Reset progress ──────────────────────────────────────────────────────────
  const resetProgress = useCallback(() => {
    resetCollection();
    resetCoins();
    setFreePacks({});
    try { localStorage.removeItem('pkmon_free_packs'); } catch { /* ignore */ }
    setClaimedAchievements(new Set());
    try { localStorage.removeItem(getClaimedAchievementsKey(mode)); } catch { /* ignore */ }
    try { localStorage.removeItem(getFavouritesKey(mode)); } catch { /* ignore */ }
    try { localStorage.removeItem('pkmon_showcase'); } catch { /* ignore */ }
    setPityCounters({});
    try { localStorage.removeItem('pkmon_pity'); } catch { /* ignore */ }
    setEcoOpenedSetIds(new Set());
    try { localStorage.removeItem(ECON_OPENED_KEY); } catch { /* ignore */ }
    resetStats();
    prevOwnedPerSet.current = {};
    completedSetIdsRef.current = new Set();
    prevAchievementCompleteRef.current = new Set();
    achTrackingArmedRef.current = false;
  }, [mode, resetCollection, resetCoins]);

  const exportSave = useCallback(async (targetMode, passphrase) => {
    const collectionKey = getCollectionKey(targetMode);
    const statsKey = getStatsKey(targetMode);
    const favouritesKey = getFavouritesKey(targetMode);
    const claimedKey = getClaimedAchievementsKey(targetMode);

    const parseJson = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    };

    const data = {
      collection: parseJson(collectionKey, []),
      favourites: parseJson(favouritesKey, []),
      claimedAchievements: parseJson(claimedKey, []),
      stats: parseJson(statsKey, {}),
      difficulty: targetMode === 'economy'
        ? (difficultyProfiles.economy ?? DEFAULT_DIFFICULTY_BY_MODE.economy)
        : (difficultyProfiles.sandbox ?? DEFAULT_DIFFICULTY_BY_MODE.sandbox),
    };

    if (targetMode === 'economy') {
      data.coins = (() => {
        const n = Number(localStorage.getItem('pkmon_economy_coins'));
        return Number.isFinite(n) ? n : STARTING_BALANCE;
      })();
      data.freePacks = parseJson('pkmon_free_packs', {});
      data.pityCounters = parseJson('pkmon_pity', {});
      data.openedSetIds = parseJson(ECON_OPENED_KEY, []);
    }

    const encrypted = await encryptSavePayload({ mode: targetMode, data }, passphrase);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadSaveObject(encrypted, `boosterdex-${targetMode}-save-${stamp}.pkmonsave`);
  }, [difficultyProfiles.economy, difficultyProfiles.sandbox]);

  const importSave = useCallback(async (file, passphrase) => {
    const fileText = await readTextFile(file);
    const payload = await decryptSavePayload(fileText, passphrase);
    const targetMode = payload.mode;
    const data = payload.data ?? {};

    const writeJson = (key, value, fallback) => {
      const next = value == null ? fallback : value;
      localStorage.setItem(key, JSON.stringify(next));
    };

    writeJson(getCollectionKey(targetMode), data.collection, []);
    writeJson(getFavouritesKey(targetMode), data.favourites, []);
    writeJson(getClaimedAchievementsKey(targetMode), data.claimedAchievements, []);
    writeJson(getStatsKey(targetMode), data.stats, {});

    if (targetMode === 'economy' && ECONOMY_DIFFICULTIES[data.difficulty]) {
      setDifficultyProfiles((prev) => ({ ...prev, economy: data.difficulty }));
    }
    if (targetMode === 'sandbox' && SANDBOX_DIFFICULTIES[data.difficulty]) {
      setDifficultyProfiles((prev) => ({ ...prev, sandbox: data.difficulty }));
    }

    if (targetMode === 'economy') {
      const coinsValue = Number(data.coins);
      const safeCoins = Number.isFinite(coinsValue) ? Math.max(0, Math.floor(coinsValue)) : STARTING_BALANCE;
      localStorage.setItem('pkmon_economy_coins', String(safeCoins));
      writeJson('pkmon_free_packs', data.freePacks, {});
      writeJson('pkmon_pity', data.pityCounters, {});
      writeJson(ECON_OPENED_KEY, data.openedSetIds, []);
    }

    // Ensure the imported profile is the active one after reload.
    try { localStorage.setItem('pkmon_mode', targetMode); } catch { /* ignore */ }
    setMode(targetMode);

    return { mode: targetMode };
  }, []);

  // ── Tutorial ───────────────────────────────────────────────────────────────
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return !localStorage.getItem('pkmon_tutorial_done'); } catch { return true; }
  });

  const handleTutorialDone = useCallback((chosenMode, chosenDifficulty) => {
    setShowTutorial(false);
    if (chosenMode) handleModeChange(chosenMode);
    if (chosenMode && chosenDifficulty) {
      changeDifficulty(chosenMode, chosenDifficulty, { skipCost: true });
    }
    try { localStorage.setItem('pkmon_tutorial_done', '1'); } catch { /* ignore */ }
  }, [changeDifficulty, handleModeChange]);

  const handleReopenTutorial = useCallback(() => {
    setShowTutorial(true);
    try { localStorage.removeItem('pkmon_tutorial_done'); } catch { /* ignore */ }
  }, []);

  // ── Developer mode ────────────────────────────────────────────────────────
  // Hidden panel — toggle with Ctrl+Shift+D
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [forcedPack, setForcedPack] = useState(null); // Card[] | null

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDevPanel((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const devFireToast = useCallback((toast) => {
    const packs = economyMode ? getAchievementReward({ rarity: toast.rarity }) : 0;
    setAchToasts((prev) => [
      ...prev.filter((t) => t.id !== toast.id),
      { ...toast, id: `__dev-${Date.now()}__`, packs },
    ]);
  }, [economyMode]);

  const devFireSetComplete = useCallback(() => {
    setSetCompleteName(currentSetConfig?.name ?? 'Test Set');
    setSetCompleteTotal(currentSetCards?.length ?? 102);
    setSetComplete(true);
  }, [currentSetConfig, currentSetCards]);

  const devClearAchievements = useCallback(() => {
    setClaimedAchievements(new Set());
    try { localStorage.removeItem(getClaimedAchievementsKey(mode)); } catch { /* ignore */ }
  }, [mode]);

  const devAwardFreePacks = useCallback((n) => {
    const targetSet = selectedSetId ?? 'base1';
    for (let i = 0; i < n; i++) awardFreePack(targetSet);
  }, [selectedSetId, awardFreePack]);

  const devClearCaches = useCallback(() => {
    cacheClearAll();
    setLoadedSets({});
    setSetSymbols({});
    setSetError(null);
    if (selectedSetId && selectedSetId !== BOOSTERDEX_MAIN_SET_ID && selectedSetId !== BOOSTERDEX_SPECIAL_SET_ID) {
      loadSet(selectedSetId);
    }
    loadAllSetSymbols().then(setSetSymbols).catch(() => {});
  }, [selectedSetId, loadSet]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);

  const canOpenCurrentSet = Array.isArray(currentSetCards) && currentSetCards.length > 0;
  const showSetSelector = !selectedSetId || (!currentSetCards && !setLoading && !setError);

  const handleCardsAdded = useCallback((drawnCards) => {
    armAchievementTracking();
    addCards(drawnCards);
    if (!economyMode) return;
    if (!selectedSetId || isBoosterDexSelected) return;
    if (!SETS.some((set) => set.id === selectedSetId)) return;
    setEcoOpenedSetIds((prev) => {
      if (prev.has(selectedSetId)) return prev;
      const next = new Set(prev);
      next.add(selectedSetId);
      saveEcoOpenedSetIds(next);
      return next;
    });
  }, [armAchievementTracking, addCards, economyMode, selectedSetId, isBoosterDexSelected]);

  const getEffectiveSellSetId = useCallback((card) => {
    if (isBoosterDexSelected) {
      return card?.setId ?? 'base1';
    }
    return card?.setId ?? selectedSetId ?? 'base1';
  }, [selectedSetId, isBoosterDexSelected]);

  return (
    <>
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">&#9670;</span>
          <h1>Booster<span>Dex</span></h1>
        </div>
        {economyMode && (
          <div className="header-economy">
            <div className="coin-display">
              <span className="coin-display__icon">🪙</span>
              <span className="coin-display__amount">{coins.toLocaleString()}</span>
            </div>
            {Object.values(freePacks).some((v) => v > 0) && (
              <div className="free-pack-display">
                <span className="free-pack-display__icon">🎁</span>
                <span className="free-pack-display__amount">{Object.values(freePacks).reduce((s, v) => s + v, 0)}</span>
              </div>
            )}
          </div>
        )}
        <nav className="app-header__nav">
          {/* Desktop navigation */}
          <div className="nav-desktop">
            <button
              className={`nav-btn${view === 'pack' ? ' nav-btn--active' : ''}`}
              onClick={() => setView('pack')}
            >
              Open Packs
            </button>
            <button
              className={`nav-btn${view === 'collection' ? ' nav-btn--active' : ''}`}
              onClick={() => setView('collection')}
            >
              Collection
              {collection.length > 0 && (
                <span className="nav-btn__badge">{collection.length}</span>
              )}
            </button>
            <button
              className={`nav-btn${view === 'achievements' ? ' nav-btn--active' : ''}`}
              onClick={() => setView('achievements')}
            >
              Achievements
            </button>
            <button
              className={`nav-btn${view === 'showcase' ? ' nav-btn--active' : ''}`}
              onClick={() => setView('showcase')}
            >
              Showcase
            </button>
            <button
              className={`nav-btn${view === 'stats' ? ' nav-btn--active' : ''}`}
              onClick={() => setView('stats')}
            >
              Stats
            </button>
            <button
              className="nav-btn nav-btn--icon"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>

          {/* Mobile dropdown */}
          <div className="nav-mobile">
            {/* Economy and collection counters */}
            <div className="nav-mobile-counters">
              {economyMode && (
                <button
                  className="nav-mobile-economy-counter"
                  onClick={() => setEconomyCounterMode(economyCounterMode === 'coins' ? 'freePacks' : 'coins')}
                >
                  {economyCounterMode === 'coins' ? (
                    <>
                      <span className="nav-mobile-economy-counter__icon">🪙</span>
                      <span className="nav-mobile-economy-counter__amount">{coins.toLocaleString()}</span>
                    </>
                  ) : (
                    <>
                      <span className="nav-mobile-economy-counter__icon">🎁</span>
                      <span className="nav-mobile-economy-counter__amount">{Object.values(freePacks).reduce((s, v) => s + v, 0)}</span>
                    </>
                  )}
                </button>
              )}
              {collection.length > 0 && (
                <div className="nav-mobile-collection-badge">
                  <span className="nav-mobile-collection-badge__icon">📚</span>
                  <span className="nav-mobile-collection-badge__count">{collection.length}</span>
                </div>
              )}
            </div>

            <button
              className="nav-dropdown-btn"
              onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
            >
              <span>{viewNames[view]}</span>
              <span className="nav-dropdown-arrow">{mobileDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {mobileDropdownOpen && (
              <div className="nav-dropdown-menu">
                <button
                  className={`nav-dropdown-item${view === 'pack' ? ' nav-dropdown-item--active' : ''}`}
                  onClick={() => {
                    setView('pack');
                    setMobileDropdownOpen(false);
                  }}
                >
                  Open Packs
                </button>
                <button
                  className={`nav-dropdown-item${view === 'collection' ? ' nav-dropdown-item--active' : ''}`}
                  onClick={() => {
                    setView('collection');
                    setMobileDropdownOpen(false);
                  }}
                >
                  Collection
                  {collection.length > 0 && (
                    <span className="nav-dropdown-item__badge">{collection.length}</span>
                  )}
                </button>
                <button
                  className={`nav-dropdown-item${view === 'achievements' ? ' nav-dropdown-item--active' : ''}`}
                  onClick={() => {
                    setView('achievements');
                    setMobileDropdownOpen(false);
                  }}
                >
                  Achievements
                </button>
                <button
                  className={`nav-dropdown-item${view === 'showcase' ? ' nav-dropdown-item--active' : ''}`}
                  onClick={() => {
                    setView('showcase');
                    setMobileDropdownOpen(false);
                  }}
                >
                  Showcase
                </button>
                <button
                  className={`nav-dropdown-item${view === 'stats' ? ' nav-dropdown-item--active' : ''}`}
                  onClick={() => {
                    setView('stats');
                    setMobileDropdownOpen(false);
                  }}
                >
                  Stats
                </button>
              </div>
            )}
            <button
              className="nav-btn nav-btn--icon nav-mobile-settings"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>
        </nav>
      </header>

      {/* ── Main content ── */}
      <main className="app-main">
        {view === 'pack' && (
          <>
            {/* Loading a set */}
            {setLoading && (
              <div className="app-loading">
                <div className="pokeball-spinner">
                  <div className="pokeball-spinner__top" />
                  <div className="pokeball-spinner__band" />
                  <div className="pokeball-spinner__bottom" />
                  <div className="pokeball-spinner__center" />
                </div>
                <p>Loading {currentSetConfig?.name ?? 'set'}…</p>
              </div>
            )}

            {/* Set load error */}
            {setError && !setLoading && (
              <div className="app-error">
                <p>⚠ Could not load card data</p>
                <p className="app-error__detail">{setError}</p>
                <button
                  className="btn-retry"
                  onClick={() => selectedSetId && !isBoosterDexSelected && loadSet(selectedSetId)}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Set selector grid */}
            {!setLoading && !setError && showSetSelector && (
              <SetSelector
                onSelect={handleSelectSet}
                setSymbols={setSymbols}
                collection={collection}
                loadedSets={loadedSets}
                economyMode={economyMode}
                boosterDexMainLoadedSetCount={boosterDexMainSetCount}
                boosterDexMainLoadedCardCount={boosterDexMainCards.length}
                boosterDexMainUnlocked={boosterDexMainUnlocked}
                boosterDexMainProgress={boosterDexMainProgress}
                boosterDexMainTotal={MAIN_SET_IDS.length}
                boosterDexSpecialLoadedSetCount={boosterDexSpecialSetCount}
                boosterDexSpecialLoadedCardCount={boosterDexSpecialCards.length}
                boosterDexSpecialUnlocked={boosterDexSpecialUnlocked}
                boosterDexSpecialProgress={boosterDexSpecialProgress}
                boosterDexSpecialTotal={SPECIAL_SET_IDS.length}
              />
            )}

            {!setLoading && !setError && isBoosterDexSelected && !canOpenCurrentSet && (
              <div className="app-error">
                <p>Load at least one set from this expansion group before opening the BoosterDex Mega Pack.</p>
                <button
                  className="btn-change-set"
                  onClick={() => {
                    setSelectedSetId(null);
                    try { localStorage.removeItem('pokemon_selected_set'); } catch { /* ignore */ }
                  }}
                >
                  Choose a Set
                </button>
              </div>
            )}

            {/* Pack opener — shown when a set is selected and its cards are loaded */}
            {!setLoading && !setError && canOpenCurrentSet && (
              <PackOpener
                key={selectedSetId}
                setId={selectedSetId}
                cards={currentSetCards}
                setName={currentSetConfig?.name ?? ''}
                onCardsAdded={handleCardsAdded}
                collection={collection}
                onChangeSet={() => {
                  setSelectedSetId(null);
                  try { localStorage.removeItem('pokemon_selected_set'); } catch { /* ignore */ }
                }}
                economyMode={economyMode}
                coins={coins}
                packPrice={
                  isBoosterDexMainSelected
                    ? BOOSTERDEX_MAIN_PACK_PRICE
                    : isBoosterDexSpecialSelected
                      ? BOOSTERDEX_SPECIAL_PACK_PRICE
                      : (PACK_PRICES[selectedSetId] ?? PACK_PRICES['base1'])
                }
                onBuyPack={() => spend(
                  isBoosterDexMainSelected
                    ? BOOSTERDEX_MAIN_PACK_PRICE
                    : isBoosterDexSpecialSelected
                      ? BOOSTERDEX_SPECIAL_PACK_PRICE
                      : (PACK_PRICES[selectedSetId] ?? PACK_PRICES['base1'])
                )}
                onSellCard={(card) => {
                  const sold = sellCard(card.baseCardId ?? card.id, card.grade ? { grade: card.grade } : undefined);
                  if (sold) earn(getSellPrice(card, getEffectiveSellSetId(card), economySellMultiplier));
                }}
                getCardSellPrice={(card) => getSellPrice(card, getEffectiveSellSetId(card), economySellMultiplier)}
                duplicatePullWeight={!economyMode ? sandboxPullWeight : null}
                canCoinFlip={canCoinFlip}
                onCoinFlip={() => setShowCoinFlip(true)}
                freePacks={freePacks[selectedSetId] ?? 0}
                onUseFreePack={() => consumeFreePack(selectedSetId)}
                forcedPack={forcedPack}
                onPackUsed={() => setForcedPack(null)}
                pityCount={economyMode ? (pityCounters[selectedSetId] ?? 0) : 0}
                onPityUpdate={handlePityUpdate}
                  onBuyBox={economyMode && !isBoosterDexSelected ? handleBuyBox : undefined}
              />
            )}
          </>
        )}

        {view === 'collection' && (
          <Collection
            collection={collection}
            loadedSets={loadedSets}
            setSymbols={setSymbols}
            onLoadSet={loadSet}
            economyMode={economyMode}
            onGradeCard={(card, forcedGrade) => gradeCard(card.baseCardId ?? card.id, forcedGrade)}
            onSellCard={(card) => {
              const sold = sellCard(card.baseCardId ?? card.id, card.grade ? { grade: card.grade } : undefined);
              if (sold) earn(getSellPrice(card, card.setId ?? 'base1', economySellMultiplier));
            }}
            getCardSellPrice={(card) => getSellPrice(card, card.setId ?? 'base1', economySellMultiplier)}
          />
        )}

        {view === 'achievements' && (
          <Achievements
            collection={collection}
            allCards={allLoadedCards}
            economyMode={economyMode}
            claimedAchievements={claimedAchievements}
          />
        )}

        {view === 'showcase' && (
          <Showcase collection={collection} />
        )}

        {view === 'stats' && (
          <Stats loadedSets={loadedSets} />
        )}
      </main>
    </div>
    {showSettings && (
      <Settings
        onClose={() => setShowSettings(false)}
        mode={mode}
        onModeChange={handleModeChange}
        onResetProgress={resetProgress}
        onRecheckAchievements={recheckAchievements}
        onExportSave={exportSave}
        onImportSave={importSave}
        coins={coins}
        difficultyProfiles={difficultyProfiles}
        economyDifficultyCostContext={economyDifficultyCostContext}
        onChangeDifficulty={changeDifficulty}
      />
    )}
    {showCoinFlip && (
      <CoinFlip
        eligibleSets={eligibleFlipSets}
        onWin={awardFreePack}
        onClose={() => setShowCoinFlip(false)}
      />
    )}
    {setComplete && (
      <div className="set-complete-overlay" onClick={() => setSetComplete(false)}>
        <div className="set-complete-modal" onClick={(e) => e.stopPropagation()}>
          <div className="set-complete-rays" />
          <div className="set-complete-badge">&#9670;</div>
          <h2 className="set-complete-title">{setCompleteName} Complete!</h2>
          <p className="set-complete-sub">You've collected all {setCompleteTotal} cards.</p>
          <p className="set-complete-flavor">A true Pokémon Master.</p>
          <button className="set-complete-btn" onClick={() => setSetComplete(false)}>Continue</button>
        </div>
      </div>
    )}
    {achToasts.length > 0 && (
      <div className={`ach-toast-stack${showDevPanel ? ' ach-toast-stack--dev' : ''}`}>
        {achToasts.map((toast) => (
          <AchToast
            key={toast.id}
            {...toast}
            onDismiss={() => dismissAchToast(toast.id)}
          />
        ))}
      </div>
    )}
    {showDevPanel && (
      <DevPanel
        onClose={() => setShowDevPanel(false)}
        coins={coins}
        onFireToast={devFireToast}
        onFireSetComplete={devFireSetComplete}
        forcedPack={forcedPack}
        onSetForcedPack={setForcedPack}
        onClearForcedPack={() => setForcedPack(null)}
        currentSetCards={currentSetCards}
        currentSetName={currentSetConfig?.name}
        onClearAchievements={devClearAchievements}
        onClearCaches={devClearCaches}
        onAwardFreePacks={devAwardFreePacks}
        onSetCoins={setCoins}
        onReopenTutorial={handleReopenTutorial}
        collection={collection}
        onSetCollectionCardGrade={devSetCardGrade}
        difficultyCostMultiplierOverride={devDifficultyCostMultiplierOverride}
        onSetDifficultyCostMultiplierOverride={setDevDifficultyCostMultiplierOverride}
        onMaxPity={() => {
          if (!selectedSetId) return;
          setPityCounters((prev) => {
            const next = { ...prev, [selectedSetId]: 10 };
            try { localStorage.setItem('pkmon_pity', JSON.stringify(next)); } catch { /* ignore */ }
            return next;
          });
        }}
      />
    )}
    {showTutorial && <Tutorial onDone={handleTutorialDone} />}
    </>
  );
}
