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
import { PACK_PRICES, getSellPrice, STARTING_BALANCE } from './services/economy.js';
import { ACHIEVEMENT_SETS, computeProgress, getAchievementReward } from './services/achievements.js';
import { resetStats, recordSetCompletion } from './services/stats.js';
import Settings from './components/Settings.jsx';
import CoinFlip from './components/CoinFlip.jsx';
import AchToast from './components/AchToast.jsx';
import DevPanel from './components/DevPanel.jsx';
import Tutorial from './components/Tutorial.jsx';
import './App.css';

const BOOSTERDEX_MAIN_SET_ID = '__boosterdex_main__';
const BOOSTERDEX_SPECIAL_SET_ID = '__boosterdex_special__';
const ECON_OPENED_KEY = 'pkmon_eco_opened_sets';

function isSpecialExpansion(set) {
  return set?.expansionGroup === 'special';
}

const MAIN_SET_IDS = SETS.filter((set) => !isSpecialExpansion(set)).map((set) => set.id);
const SPECIAL_SET_IDS = SETS.filter((set) => isSpecialExpansion(set)).map((set) => set.id);

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

  // All cards from every loaded set combined — fed to Achievements
  const allLoadedCards = useMemo(
    () => Object.values(loadedSets).flat(),
    [loadedSets],
  );

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
  const economyMode = mode === 'economy';
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

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    try { localStorage.setItem('pkmon_mode', newMode); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!economyMode || !isBoosterDexSelected) return;
    if (isBoosterDexMainSelected && boosterDexMainUnlocked) return;
    if (isBoosterDexSpecialSelected && boosterDexSpecialUnlocked) return;
    setSelectedSetId(null);
    try { localStorage.removeItem('pokemon_selected_set'); } catch { /* ignore */ }
  }, [economyMode, isBoosterDexSelected, isBoosterDexMainSelected, isBoosterDexSpecialSelected, boosterDexMainUnlocked, boosterDexSpecialUnlocked]);

  // ── Economy (coins) ──────────────────────────────────────────────────────
  const { coins, spend, earn, reset: resetCoins } = useEconomy();
  const [showCoinFlip, setShowCoinFlip] = useState(false);

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

  useEffect(() => {
    const ownedIds = new Set(collection.map((c) => c.id));
    for (const [setId, setCards] of Object.entries(loadedSets)) {
      const currentOwned = setCards.filter((c) => ownedIds.has(c.id)).length;
      const prevOwned = prevOwnedPerSet.current[setId] ?? 0;
      if (prevOwned < setCards.length && currentOwned >= setCards.length) {
        const cfg = SETS.find((s) => s.id === setId);
        setSetCompleteName(cfg?.name ?? setId);
        setSetCompleteTotal(setCards.length);
        setSetComplete(true);
        recordSetCompletion(setId);
      }
      prevOwnedPerSet.current[setId] = currentOwned;
    }
  }, [collection, loadedSets]);

  // ── Achievement pack rewards (economy mode) ────────────────────────────────
  const [claimedAchievements, setClaimedAchievements] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pkmon_claimed_ach') ?? '[]')); }
    catch { return new Set(); }
  });
  const [achToasts, setAchToasts] = useState([]);

  const dismissAchToast = useCallback((id) => {
    setAchToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!allLoadedCards.length) return;
    const progress = computeProgress(allLoadedCards, collection);
    const newClaims = [];
    for (const achSet of ACHIEVEMENT_SETS) {
      for (const ach of achSet.achievements) {
        const prog = progress.get(ach.id);
        if (prog?.complete && !claimedAchievements.has(ach.id)) {
          newClaims.push({ ach, setName: achSet.name });
        }
      }
    }
    if (newClaims.length === 0) return;

    // Award packs in economy mode (fall back to base1 if no sets with cards yet)
    const eligibleIds = setsWithCards.length > 0 ? setsWithCards : ['base1'];
    const newToasts = [];
    for (const { ach, setName } of newClaims) {
      let packs = 0;
      if (economyMode) {
        packs = getAchievementReward(ach);
        for (let i = 0; i < packs; i++) {
          const randomSetId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
          awardFreePack(randomSetId);
        }
      }
      // Skip full-set toasts — the set-complete modal already fires for those
      if (ach.rarity !== null) {
        newToasts.push({ id: ach.id, title: ach.title, icon: ach.icon, rarity: ach.rarity, setName, packs });
      }
    }

    if (newToasts.length > 0) setAchToasts((prev) => [...prev, ...newToasts]);

    setClaimedAchievements((prev) => {
      const next = new Set([...prev, ...newClaims.map(({ ach }) => ach.id)]);
      try { localStorage.setItem('pkmon_claimed_ach', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  // claimedAchievements intentionally omitted — we only re-run on collection/cards change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, allLoadedCards, economyMode]);

  // ── Reset progress ──────────────────────────────────────────────────────────
  const resetProgress = useCallback(() => {
    resetCollection();
    resetCoins();
    setFreePacks({});
    try { localStorage.removeItem('pkmon_free_packs'); } catch { /* ignore */ }
    setClaimedAchievements(new Set());
    try { localStorage.removeItem('pkmon_claimed_ach'); } catch { /* ignore */ }
    try { localStorage.removeItem('pkmon_favourites'); } catch { /* ignore */ }
    try { localStorage.removeItem('pkmon_showcase'); } catch { /* ignore */ }
    setPityCounters({});
    try { localStorage.removeItem('pkmon_pity'); } catch { /* ignore */ }
    setEcoOpenedSetIds(new Set());
    try { localStorage.removeItem(ECON_OPENED_KEY); } catch { /* ignore */ }
    resetStats();
    prevOwnedPerSet.current = {};
  }, [resetCollection, resetCoins]);

  // ── Tutorial ───────────────────────────────────────────────────────────────
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return !localStorage.getItem('pkmon_tutorial_done'); } catch { return true; }
  });

  const handleTutorialDone = useCallback((chosenMode) => {
    setShowTutorial(false);
    if (chosenMode) handleModeChange(chosenMode);
    try { localStorage.setItem('pkmon_tutorial_done', '1'); } catch { /* ignore */ }
  }, [handleModeChange]);

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
    try { localStorage.removeItem('pkmon_claimed_ach'); } catch { /* ignore */ }
  }, []);

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
  }, [addCards, economyMode, selectedSetId, isBoosterDexSelected]);

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
                  if (sold) earn(getSellPrice(card, getEffectiveSellSetId(card)));
                }}
                getCardSellPrice={(card) => getSellPrice(card, getEffectiveSellSetId(card))}
                canCoinFlip={canCoinFlip}
                onCoinFlip={() => setShowCoinFlip(true)}
                freePacks={freePacks[selectedSetId] ?? 0}
                onUseFreePack={() => consumeFreePack(selectedSetId)}
                forcedPack={forcedPack}
                onPackUsed={() => setForcedPack(null)}
                pityCount={economyMode ? (pityCounters[selectedSetId] ?? 0) : 0}
                onPityUpdate={handlePityUpdate}
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
              if (sold) earn(getSellPrice(card, card.setId ?? 'base1'));
            }}
            getCardSellPrice={(card) => getSellPrice(card, card.setId ?? 'base1')}
          />
        )}

        {view === 'achievements' && (
          <Achievements
            collection={collection}
            allCards={allLoadedCards}
            economyMode={economyMode}
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
    {showSettings && <Settings onClose={() => setShowSettings(false)} mode={mode} onModeChange={handleModeChange} onResetProgress={resetProgress} />}
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
        onReopenTutorial={handleReopenTutorial}
        collection={collection}
        onSetCollectionCardGrade={devSetCardGrade}
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
