import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import PokemonCard from './PokemonCard.jsx';
import CardModal from './CardModal.jsx';
import { SETS } from '../services/sets.js';
import { getFavourites } from '../services/favourites.js';
import './Collection.css';
import './SetSelector.css';

function isSpecialExpansion(set) {
  return set?.expansionGroup === 'special';
}

function toggleSet(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const TYPE_COLORS = {
  Fire: '#ef4444',
  Water: '#3b82f6',
  Grass: '#22c55e',
  Lightning: '#eab308',
  Fighting: '#ea580c',
  Psychic: '#a855f7',
  Colorless: '#94a3b8',
  Darkness: '#475569',
  Metal: '#9ca3af',
  Dragon: '#0ea5e9',
  Fairy: '#ec4899',
};

const sortScore = (card) => {
  if (card.rarity === 'Rare Shiny') return -1;
  if (card.rarity === 'Radiant Rare') return -1;
  if (card.rarity === 'Secret Rare') return 0;
  if (card.rarity === 'Ultra Rare') return 1;
  if (card.rarity === 'Rare ex') return 2;
  if (card.rarity === 'Rare LV.X') return 2;
  if (card.rarity === 'Rare BREAK') return 3;
  if (card.holo && card.rarity === 'Rare') return 4;
  if (card.reverseHolo && card.rarity === 'Rare') return 5;
  if (!card.holo && !card.reverseHolo && card.rarity === 'Rare') return 6;
  if (card.reverseHolo) return 7;
  if (card.holo) return 8;
  if (card.rarity === 'Uncommon') return 9;
  if (card.rarity === 'Common') return 10;
  return 11;
};

const gradedCount = (card) => {
  if (card?.graded) {
    return Object.values(card.graded).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  }
  if (typeof card?.grade === 'number') return card.count ?? 1;
  return 0;
};

const FILTER_CLASS = {
  All: 'filter-tab--all',
  Holo: 'filter-tab--rare-holo',
  EX: 'filter-tab--rare',
  GX: 'filter-tab--rare-gx',
  V: 'filter-tab--rare-v',
  VMAX: 'filter-tab--rare-vmax',
  VSTAR: 'filter-tab--rare-vstar',
  'MEGA EX': 'filter-tab--rare',
  BREAK: 'filter-tab--rare-break',
  Rare: 'filter-tab--rare',
  Uncommon: 'filter-tab--uncommon',
  Common: 'filter-tab--common',
  'Secret Rare': 'filter-tab--secret-rare',
  'Ultra Rare': 'filter-tab--ultra-rare',
  'Rare LV.X': 'filter-tab--rare-lvx',
  'Rare Shiny': 'filter-tab--rare-shiny',
  'Radiant Rare': 'filter-tab--radiant-rare',
  Graded: 'filter-tab--graded',
};

const FILTER_LABEL = {
  'Radiant Rare': 'Radiant',
};

const SET_SUBSETS = {
  bw11: {
    key: 'rc',
    label: 'Radiant Collection',
    description: 'Subset cards with RC-numbered local IDs',
    prefix: 'RC',
    fallbackTotal: 25,
    className: 'coll-subset-card--radiant',
  },
  g1: {
    key: 'rc',
    label: 'Radiant Collection',
    description: 'Subset cards with RC-numbered local IDs',
    prefix: 'RC',
    fallbackTotal: 32,
    className: 'coll-subset-card--radiant',
  },
  sm115: {
    key: 'sv',
    label: 'Shiny Vault',
    description: 'Subset cards with SV-numbered local IDs',
    prefix: 'SV',
    fallbackTotal: 94,
    className: 'coll-subset-card--radiant',
  },
  'swsh4.5': {
    key: 'sv',
    label: 'Shiny Vault',
    description: 'Subset cards with SV-numbered local IDs',
    prefix: 'SV',
    fallbackTotal: 122,
    className: 'coll-subset-card--radiant',
  },
  cel25: {
    key: 'cc',
    label: 'Classic Collection',
    description: 'Subset cards with A-marked local IDs',
    matcher: (localId) => /A/i.test(String(localId ?? '')),
    fallbackTotal: 25,
    className: 'coll-subset-card--radiant',
  },
  swsh9: {
    key: 'tg',
    label: 'Trainer Gallery',
    description: 'Subset cards with TG-numbered local IDs',
    prefix: 'TG',
    fallbackTotal: 30,
    className: 'coll-subset-card--trainer-gallery',
  },
  swsh10: {
    key: 'tg',
    label: 'Trainer Gallery',
    description: 'Subset cards with TG-numbered local IDs',
    prefix: 'TG',
    fallbackTotal: 30,
    className: 'coll-subset-card--trainer-gallery',
  },
  swsh11: {
    key: 'tg',
    label: 'Trainer Gallery',
    description: 'Subset cards with TG-numbered local IDs',
    prefix: 'TG',
    fallbackTotal: 30,
    className: 'coll-subset-card--trainer-gallery',
  },
  swsh12: {
    key: 'tg',
    label: 'Trainer Gallery',
    description: 'Subset cards with TG-numbered local IDs',
    prefix: 'TG',
    fallbackTotal: 30,
    className: 'coll-subset-card--trainer-gallery',
  },
  'swsh12.5': {
    key: 'gg',
    label: 'Galarian Gallery',
    description: 'Subset cards with GG-numbered local IDs',
    prefix: 'GG',
    fallbackTotal: 70,
    className: 'coll-subset-card--trainer-gallery',
  },
};

function getSubsetConfig(setId) {
  return SET_SUBSETS[setId] ?? null;
}

function isSubsetCard(card, subsetConfig) {
  if (!subsetConfig) return false;
  if (typeof subsetConfig.matcher === 'function') {
    return subsetConfig.matcher(card?.localId);
  }
  return new RegExp(`^${subsetConfig.prefix}`, 'i').test(String(card?.localId ?? ''));
}

function compareLocalIds(a, b) {
  const parse = (value) => {
    const text = String(value ?? '');
    if (/^(RC|TG|SV|GG)/i.test(text)) {
      const n = parseInt(text.replace(/^[A-Z]+/i, ''), 10);
      return { group: 1, num: Number.isNaN(n) ? 0 : n, text };
    }
    const n = parseInt(text, 10);
    if (!Number.isNaN(n)) return { group: 0, num: n, text };
    return { group: 2, num: 0, text };
  };

  const pa = parse(a);
  const pb = parse(b);
  if (pa.group !== pb.group) return pa.group - pb.group;
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.text.localeCompare(pb.text);
}

function isOfficialNumberedCard(card, setConfig) {
  if (!setConfig?.totalCards) return true;
  const n = parseInt(String(card?.localId ?? ''), 10);
  if (Number.isNaN(n)) return false;
  return n <= setConfig.totalCards;
}

function loadStoredArray(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredArray(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function loadStoredValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredValue(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export default function Collection({
  collection,
  loadedSets = {},
  setSymbols = {},
  onLoadSet,
  economyMode = false,
  onSellCard,
  onGradeCard,
  getCardSellPrice,
}) {
  const [activeSetId, setActiveSetId] = useState(() => loadStoredValue('pkmon_collection_active_set', null));
  const [hideComplete, setHideComplete] = useState(() => loadStoredValue('pkmon_collection_hide_complete', false));
  const [filter, setFilter] = useState(() => loadStoredValue('pkmon_collection_filter', 'All'));
  const [sortBy, setSortBy] = useState(() => loadStoredValue('pkmon_collection_sort_by', 'rarity'));
  const [filterType, setFilterType] = useState(() => loadStoredValue('pkmon_collection_filter_type', null));
  const [viewMode, setViewMode] = useState(() => loadStoredValue('pkmon_collection_view_mode', 'collection'));
  const [activeSetSubset, setActiveSetSubset] = useState(() => loadStoredValue('pkmon_collection_active_subset', null));
  const [modalCard, setModalCard] = useState(null);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);

  const [showFilter, setShowFilter] = useState(false);
  const [selSeries, setSelSeries] = useState(() => new Set(loadStoredArray('pkmon_collection_series')));
  const [selYears, setSelYears] = useState(() => new Set(loadStoredArray('pkmon_collection_years')));
  const [setSearch, setSetSearch] = useState(() => loadStoredValue('pkmon_collection_search', ''));
  const [expansionView, setExpansionView] = useState(() => loadStoredValue('pkmon_collection_expansion_view', 'main'));

  const [favouriteIds, setFavouriteIds] = useState(() => getFavourites());

  const filterPopupRef = useRef(null);

  const refreshFavourites = useCallback(() => setFavouriteIds(getFavourites()), []);
  const activeFilterCount = selSeries.size + selYears.size + (hideComplete ? 1 : 0);
  const clearAllFilters = () => {
    setSelSeries(new Set());
    setSelYears(new Set());
    setHideComplete(false);
  };

  useEffect(() => { saveStoredValue('pkmon_collection_active_set', activeSetId); }, [activeSetId]);
  useEffect(() => { saveStoredValue('pkmon_collection_hide_complete', hideComplete); }, [hideComplete]);
  useEffect(() => { saveStoredValue('pkmon_collection_filter', filter); }, [filter]);
  useEffect(() => { saveStoredValue('pkmon_collection_sort_by', sortBy); }, [sortBy]);
  useEffect(() => { saveStoredValue('pkmon_collection_filter_type', filterType); }, [filterType]);
  useEffect(() => { saveStoredValue('pkmon_collection_view_mode', viewMode); }, [viewMode]);
  useEffect(() => { saveStoredValue('pkmon_collection_active_subset', activeSetSubset); }, [activeSetSubset]);
  useEffect(() => { saveStoredArray('pkmon_collection_series', [...selSeries]); }, [selSeries]);
  useEffect(() => { saveStoredArray('pkmon_collection_years', [...selYears]); }, [selYears]);
  useEffect(() => { saveStoredValue('pkmon_collection_search', setSearch); }, [setSearch]);
  useEffect(() => { saveStoredValue('pkmon_collection_expansion_view', expansionView); }, [expansionView]);

  const scopedSets = useMemo(
    () => SETS.filter((set) => (expansionView === 'special' ? isSpecialExpansion(set) : !isSpecialExpansion(set))),
    [expansionView],
  );
  const seriesOptions = useMemo(() => [...new Set(scopedSets.map((s) => s.series))], [scopedSets]);
  const yearOptions = useMemo(() => [...new Set(scopedSets.map((s) => s.year))].sort(), [scopedSets]);

  useEffect(() => {
    if (!showFilter) return;
    const handler = (e) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(e.target)) {
        setShowFilter(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showFilter]);

  const ownedIds = useMemo(() => new Set(collection.map((c) => c.id)), [collection]);
  const isFavouritesView = activeSetId === '__favourites__';
  const subsetConfig = !isFavouritesView ? getSubsetConfig(activeSetId) : null;
  const isSplitSubsetSet = !isFavouritesView && subsetConfig !== null;
  const shouldChooseSubset = isSplitSubsetSet && activeSetSubset === null;

  const setCards = useMemo(
    () => {
      if (isFavouritesView) return [];
      const base = collection.filter((c) => (c.setId ?? 'base1') === activeSetId);
      if (!isSplitSubsetSet) return base;
      if (activeSetSubset === 'main') return base.filter((c) => !isSubsetCard(c, subsetConfig));
      if (activeSetSubset === subsetConfig?.key) return base.filter((c) => isSubsetCard(c, subsetConfig));
      return [];
    },
    [collection, activeSetId, isFavouritesView, isSplitSubsetSet, activeSetSubset, subsetConfig],
  );

  const activeFavCards = useMemo(
    () => (isFavouritesView ? collection.filter((c) => favouriteIds.has(c.id)) : []),
    [isFavouritesView, collection, favouriteIds],
  );

  const activeSetCards = isFavouritesView ? activeFavCards : setCards;

  useEffect(() => {
    if (!modalCard) return;
    const fresh = activeSetCards.find((c) => c.id === modalCard.id);
    if (fresh && fresh !== modalCard) setModalCard(fresh);
  }, [modalCard, activeSetCards]);

  useEffect(() => {
    if (!activeSetId || isFavouritesView || viewMode !== 'checklist') {
      setIsLoadingChecklist(false);
      return;
    }
    if (loadedSets[activeSetId]) {
      setIsLoadingChecklist(false);
      return;
    }
    if (!onLoadSet) return;

    let cancelled = false;
    setIsLoadingChecklist(true);
    Promise.resolve(onLoadSet(activeSetId)).finally(() => {
      if (!cancelled) setIsLoadingChecklist(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeSetId, isFavouritesView, viewMode, loadedSets, onLoadSet]);

  const availableTypes = useMemo(() => {
    const typeSet = new Set();
    for (const card of activeSetCards) {
      if (card.types?.length) card.types.forEach((t) => typeSet.add(t));
    }
    return [...typeSet].sort();
  }, [activeSetCards]);

  const displayed = useMemo(() => {
    let base;
    if (filter === 'All') base = activeSetCards;
    else if (filter === 'Holo') base = activeSetCards.filter((c) => c.holo === true || c.reverseHolo === true);
    else if (filter === 'EX') base = activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.gx !== true && c.v !== true && c.vmax !== true && c.vstar !== true);
    else if (filter === 'GX') base = activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.gx === true);
    else if (filter === 'V') base = activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.v === true && c.vmax !== true && c.vstar !== true);
    else if (filter === 'VMAX') base = activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.vmax === true);
    else if (filter === 'VSTAR') base = activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.vstar === true);
    else if (filter === 'MEGA EX') base = activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.megaEx === true);
    else if (filter === 'BREAK') base = activeSetCards.filter((c) => c.rarity === 'Rare BREAK');
    else if (filter === 'Graded') {
      base = activeSetCards.flatMap((c) => {
        if (!c.graded && typeof c.grade === 'number') {
          const totalGraded = c.count ?? 1;
          const totalUngraded = Math.max(0, (c.count ?? 1) - totalGraded);
          return [{
            ...c,
            id: `${c.id}__graded_${c.grade}`,
            baseCardId: c.id,
            grade: Number(c.grade),
            count: c.count ?? 1,
            totalGraded,
            totalUngraded,
          }];
        }
        if (!c.graded) return [];
        const totalGraded = Object.values(c.graded).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
        const totalUngraded = Math.max(0, (c.count ?? 1) - totalGraded);
        return Object.entries(c.graded)
          .filter(([, qty]) => (Number(qty) || 0) > 0)
          .map(([grade, qty]) => ({
            ...c,
            id: `${c.id}__graded_${grade}`,
            baseCardId: c.id,
            grade: Number(grade),
            count: Number(qty),
            totalGraded,
            totalUngraded,
          }));
      });
    } else {
      base = activeSetCards.filter((c) => c.rarity === filter);
    }

    if (filter !== 'Graded') {
      base = base.map((c) => {
        const totalGraded = Object.values(c.graded ?? {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
        const totalUngraded = Math.max(0, (c.count ?? 1) - totalGraded);
        return { ...c, totalGraded, totalUngraded };
      });
    }

    if (filterType !== null) {
      base = base.filter((c) => c.types?.includes(filterType));
    }

    return [...base].sort((a, b) => {
      if (sortBy === 'count') {
        return (b.count ?? 1) - (a.count ?? 1) || sortScore(a) - sortScore(b) || a.name.localeCompare(b.name);
      }
      if (filter === 'Graded') {
        return (b.grade ?? 0) - (a.grade ?? 0) || a.name.localeCompare(b.name);
      }
      return sortScore(a) - sortScore(b) || a.name.localeCompare(b.name);
    });
  }, [activeSetCards, filter, sortBy, filterType]);

  const checklistCards = useMemo(() => {
    const cards = loadedSets[activeSetId];
    if (!cards) return null;
    let filtered = cards;
    if (isSplitSubsetSet) {
      if (activeSetSubset === 'main') filtered = cards.filter((c) => !isSubsetCard(c, subsetConfig));
      else if (activeSetSubset === subsetConfig?.key) filtered = cards.filter((c) => isSubsetCard(c, subsetConfig));
      else filtered = [];
    }
    return [...filtered].sort((a, b) => compareLocalIds(a.localId, b.localId));
  }, [loadedSets, activeSetId, isSplitSubsetSet, activeSetSubset, subsetConfig]);

  const ownedOfficialBySet = useMemo(() => {
    const result = {};
    for (const card of collection) {
      const sid = card.setId ?? 'base1';
      if (card.rarity === 'Secret Rare' || card.rarity === 'Rare Shiny') continue;
      result[sid] = (result[sid] ?? 0) + 1;
    }
    return result;
  }, [collection]);

  const ownedTotalBySet = useMemo(() => {
    const result = {};
    for (const card of collection) {
      const sid = card.setId ?? 'base1';
      result[sid] = (result[sid] ?? 0) + 1;
    }
    return result;
  }, [collection]);

  const visibleSets = useMemo(() => {
    return scopedSets.filter((set) => {
      if (selSeries.size > 0 && !selSeries.has(set.series)) return false;
      if (selYears.size > 0 && !selYears.has(set.year)) return false;
      if (setSearch.trim()) {
        const q = setSearch.trim().toLowerCase();
        const hay = `${set.name} ${set.series} ${set.year}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!hideComplete) return true;
      const setSubsetConfig = getSubsetConfig(set.id);
      const owned = setSubsetConfig
        ? collection.filter((c) => (c.setId ?? 'base1') === set.id && c.rarity !== 'Secret Rare' && c.rarity !== 'Rare Shiny' && !isSubsetCard(c, setSubsetConfig)).length
        : collection.filter((c) => (c.setId ?? 'base1') === set.id && !c.reverseHolo && isOfficialNumberedCard(c, set)).length;
      const total = setSubsetConfig
        ? ((loadedSets[set.id]?.filter((c) => c.rarity !== 'Secret Rare' && c.rarity !== 'Rare Shiny' && !isSubsetCard(c, setSubsetConfig)).length) ?? set.totalCards)
        : ((loadedSets[set.id]?.filter((c) => !c.reverseHolo && isOfficialNumberedCard(c, set)).length) ?? set.totalCards);
      return !(owned > 0 && owned >= total);
    });
  }, [scopedSets, selSeries, selYears, setSearch, hideComplete, loadedSets, collection]);

  if (!activeSetId) {
    return (
      <>
        <div className="coll-screen">
          <div className="coll-screen__header">
            <h2 className="coll-screen__title">Collection</h2>
            <div className="coll-bar-row">
              <div className="ss-filter-bar ss-filter-bar--fullwidth">
                    <div className="ss-filter-bar__top">
                      <button
                        className={`ss-filter-btn${activeFilterCount > 0 ? ' ss-filter-btn--active' : ''}`}
                        onClick={() => setShowFilter((v) => !v)}
                        aria-expanded={showFilter}
                      >
                        <span>Filter</span>
                        {activeFilterCount > 0 && <span className="ss-filter-badge">{activeFilterCount}</span>}
                      </button>
                      <input
                        className="ss-search-input"
                        type="text"
                        placeholder="Search sets by name, series, or year..."
                        value={setSearch}
                        onChange={(e) => setSetSearch(e.target.value)}
                      />
                    </div>
                      <div className="ss-expansion-toggle" role="group" aria-label="Expansion type">
                        <button
                          className={`ss-expansion-toggle__btn${expansionView === 'main' ? ' ss-expansion-toggle__btn--active' : ''}`}
                          onClick={() => {
                            setExpansionView('main');
                            setSelSeries(new Set());
                            setSelYears(new Set());
                          }}
                        >
                          Main Series
                        </button>
                        <button
                          className={`ss-expansion-toggle__btn${expansionView === 'special' ? ' ss-expansion-toggle__btn--active' : ''}`}
                          onClick={() => {
                            setExpansionView('special');
                            setSelSeries(new Set());
                            setSelYears(new Set());
                          }}
                        >
                          Special Expansions
                        </button>
                      </div>
                    {activeFilterCount > 0 && (
                      <div className="ss-chips">
                        {[...selSeries].map((s) => (
                          <button key={s} className="ss-chip" onClick={() => setSelSeries(toggleSet(selSeries, s))}>{s} &times;</button>
                        ))}
                        {[...selYears].map((y) => (
                          <button key={y} className="ss-chip" onClick={() => setSelYears(toggleSet(selYears, y))}>{y} &times;</button>
                        ))}
                        {hideComplete && (
                          <button className="ss-chip" onClick={() => setHideComplete(false)}>Hide completed &times;</button>
                        )}
                        <button className="ss-chip ss-chip--clear" onClick={clearAllFilters}>Clear all</button>
                      </div>
                    )}
                {showFilter && (
                  <div className="ss-popup" ref={filterPopupRef}>
                    <div className="ss-popup__section">
                      <span className="ss-popup__label">Series</span>
                      <div className="ss-popup__options">
                        {seriesOptions.map((s) => (
                          <button key={s} className={`ss-option${selSeries.has(s) ? ' ss-option--on' : ''}`} onClick={() => setSelSeries(toggleSet(selSeries, s))}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div className="ss-popup__divider" />
                    <div className="ss-popup__section">
                      <span className="ss-popup__label">Year</span>
                      <div className="ss-popup__options ss-popup__options--years">
                        {yearOptions.map((y) => (
                          <button key={y} className={`ss-option${selYears.has(y) ? ' ss-option--on' : ''}`} onClick={() => setSelYears(toggleSet(selYears, y))}>{y}</button>
                        ))}
                      </div>
                    </div>
                    <div className="ss-popup__divider" />
                    <div className="ss-popup__section">
                      <span className="ss-popup__label">Set Progress</span>
                      <div className="ss-popup__options">
                        <button
                          className={`ss-option${hideComplete ? ' ss-option--on' : ''}`}
                          onClick={() => setHideComplete((v) => !v)}
                        >
                          Hide completed sets
                        </button>
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <>
                        <div className="ss-popup__divider" />
                        <button className="ss-popup__clear" onClick={() => { clearAllFilters(); setShowFilter(false); }}>Clear all filters</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="coll-set-list">
            {favouriteIds.size > 0 && (
              <button
                className="coll-set-card coll-set-card--favourites"
                style={{ '--accent': '#f43f5e' }}
                onClick={() => {
                  setActiveSetId('__favourites__');
                  setActiveSetSubset(null);
                  setFilter('All');
                  setFilterType(null);
                  setViewMode('collection');
                }}
              >
                <div className="coll-set-card__symbol-wrap">
                  <span className="coll-set-card__symbol">&#x2665;</span>
                </div>
                <div className="coll-set-card__body">
                  <span className="coll-set-card__name">Favourites</span>
                  <span className="coll-set-card__year">Your favourited cards</span>
                  <div className="coll-set-card__bar">
                    <div className="coll-set-card__bar-fill" style={{ width: '100%', background: '#f43f5e' }} />
                  </div>
                </div>
                <div className="coll-set-card__meta">
                  <span className="coll-set-card__count">{favouriteIds.size} card{favouriteIds.size !== 1 ? 's' : ''}</span>
                </div>
                <span className="coll-set-card__arrow">&#8250;</span>
              </button>
            )}

            {visibleSets.map((set) => {
              const setSubsetConfig = getSubsetConfig(set.id);
              const owned = setSubsetConfig
                ? collection.filter((c) => (c.setId ?? 'base1') === set.id && c.rarity !== 'Secret Rare' && c.rarity !== 'Rare Shiny' && !isSubsetCard(c, setSubsetConfig)).length
                : collection.filter((c) => (c.setId ?? 'base1') === set.id && !c.reverseHolo && isOfficialNumberedCard(c, set)).length;
              const total = setSubsetConfig
                ? ((loadedSets[set.id]?.filter((c) => c.rarity !== 'Secret Rare' && c.rarity !== 'Rare Shiny' && !isSubsetCard(c, setSubsetConfig)).length) ?? set.totalCards)
                : ((loadedSets[set.id]?.filter((c) => !c.reverseHolo && isOfficialNumberedCard(c, set)).length) ?? set.totalCards);
              const complete = owned > 0 && owned >= total;
              const pct = total > 0 ? Math.min((owned / total) * 100, 100) : 0;
              return (
                <button
                  key={set.id}
                  className={`coll-set-card${complete ? ' coll-set-card--complete' : ''}`}
                  style={{ '--accent': set.accentColor }}
                  onClick={() => {
                    setActiveSetId(set.id);
                    setActiveSetSubset(getSubsetConfig(set.id) ? null : 'main');
                    setFilter('All');
                    setFilterType(null);
                    setViewMode('collection');
                  }}
                >
                  <div className="coll-set-card__symbol-wrap">
                    {setSymbols[set.id]
                      ? <img className="coll-set-card__symbol-img" src={setSymbols[set.id]} alt="" />
                      : <span className="coll-set-card__symbol">{set.symbol}</span>}
                  </div>
                  <div className="coll-set-card__body">
                    <span className="coll-set-card__name">{set.name}</span>
                    <span className="coll-set-card__year">{set.year}</span>
                    <div className="coll-set-card__bar">
                      <div
                        className={`coll-set-card__bar-fill${complete ? ' coll-set-card__bar-fill--done' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="coll-set-card__meta">
                    <span className={`coll-set-card__count${complete ? ' coll-set-card__count--done' : ''}`}>
                      {complete ? '✓ ' : ''}{ownedTotalBySet[set.id] ?? 0} / {total}
                    </span>
                  </div>
                  <span className="coll-set-card__arrow">&#8250;</span>
                </button>
              );
            })}
          </div>
        </div>

        {modalCard && (
          <CardModal
            card={modalCard}
            onClose={() => setModalCard(null)}
            onFavouriteChange={refreshFavourites}
            onGradeCard={onGradeCard}
          />
        )}
      </>
    );
  }

  const setConfig = isFavouritesView ? null : SETS.find((s) => s.id === activeSetId);
  if (shouldChooseSubset && subsetConfig) {
    const mainOwned = collection.filter((c) => (c.setId ?? 'base1') === activeSetId && c.rarity !== 'Secret Rare' && c.rarity !== 'Rare Shiny' && !isSubsetCard(c, subsetConfig)).length;
    const mainTotal = loadedSets[activeSetId]?.filter((c) => c.rarity !== 'Secret Rare' && c.rarity !== 'Rare Shiny' && !isSubsetCard(c, subsetConfig)).length ?? setConfig?.totalCards ?? 0;
    const subsetOwned = collection.filter((c) => (c.setId ?? 'base1') === activeSetId && isSubsetCard(c, subsetConfig)).length;
    const subsetTotal = loadedSets[activeSetId]?.filter((c) => isSubsetCard(c, subsetConfig)).length ?? subsetConfig.fallbackTotal;

    return (
      <div className="collection">
        <div className="collection__header">
          <div className="collection__header-top">
            <button className="coll-back-btn" onClick={() => setActiveSetId(null)}>‹ Back</button>
          </div>
          <h2 className="collection__subset-title">{setConfig?.name}</h2>
          <p className="collection__subset-subtitle">Choose which part of this set you want to view.</p>
        </div>

        <div className="coll-subset-chooser">
          <button
            className="coll-subset-card"
            onClick={() => {
              setActiveSetSubset('main');
              setFilter('All');
              setFilterType(null);
              setViewMode('collection');
            }}
          >
            <span className="coll-subset-card__title">Main Set</span>
            <span className="coll-subset-card__desc">Standard {setConfig?.name} cards</span>
            <span className="coll-subset-card__count">{mainOwned} / {mainTotal}</span>
          </button>

          <button
            className={`coll-subset-card ${subsetConfig.className}`}
            onClick={() => {
              setActiveSetSubset(subsetConfig.key);
              setFilter('All');
              setFilterType(null);
              setViewMode('collection');
            }}
          >
            <span className="coll-subset-card__title">{subsetConfig.label}</span>
            <span className="coll-subset-card__desc">{subsetConfig.description}</span>
            <span className="coll-subset-card__count">{subsetOwned} / {subsetTotal}</span>
          </button>
        </div>
      </div>
    );
  }

  const subsetLabel = isSplitSubsetSet && subsetConfig
    ? (activeSetSubset === subsetConfig.key ? subsetConfig.label : 'Main Set')
    : null;
  const isOfficialCardForView = (card) => {
    if (isSplitSubsetSet && subsetConfig && activeSetSubset === subsetConfig.key) return true;
    return !card.reverseHolo && isOfficialNumberedCard(card, setConfig);
  };
  const checklistOfficialCount = checklistCards
    ? checklistCards.filter(isOfficialCardForView).length
    : (isSplitSubsetSet && subsetConfig && activeSetSubset === subsetConfig.key ? subsetConfig.fallbackTotal : (setConfig?.totalCards ?? 0));
  const officialOwnedCount = activeSetCards.filter(isOfficialCardForView).length;
  const totalCards = activeSetCards.reduce((sum, c) => sum + (c.count ?? 1), 0);

  const hasSecretRare = activeSetCards.some((c) => c.rarity === 'Secret Rare');
  const hasUltraRare = !isFavouritesView && (isSplitSubsetSet
    ? activeSetSubset === subsetConfig?.key
    : (
    (setConfig?.rarityTotals?.['Ultra Rare'] ?? 0) > 0
    || Boolean(setConfig?.rarityRanges?.['Ultra Rare'])
    ));
  const hasLvx = activeSetCards.some((c) => c.rarity === 'Rare LV.X');
  const hasShiny = activeSetCards.some((c) => c.rarity === 'Rare Shiny');
  const hasRadiant = !isFavouritesView && (
    activeSetCards.some((c) => c.rarity === 'Radiant Rare')
    || (setConfig?.rarityTotals?.['Radiant Rare'] ?? 0) > 0
  );
  const hasEx = !isFavouritesView && (
    activeSetCards.some((c) => c.rarity === 'Rare ex' && c.gx !== true && c.v !== true && c.vmax !== true && c.vstar !== true)
    || (((setConfig?.rarityTotals?.['Rare ex'] ?? 0)
      - (setConfig?.rarityTotals?.['Rare GX'] ?? 0)
      - (setConfig?.rarityTotals?.['Rare V'] ?? 0)
      - (setConfig?.rarityTotals?.['Rare VMAX'] ?? 0)
      - (setConfig?.rarityTotals?.['Rare VSTAR'] ?? 0)) > 0)
  );
  const hasGx = !isFavouritesView && (
    activeSetCards.some((c) => c.rarity === 'Rare ex' && c.gx === true)
    || (setConfig?.rarityTotals?.['Rare GX'] ?? 0) > 0
  );
  const hasV = !isFavouritesView && (
    activeSetCards.some((c) => c.rarity === 'Rare ex' && c.v === true && c.vmax !== true)
    || (setConfig?.rarityTotals?.['Rare V'] ?? 0) > 0
  );
  const hasVmax = !isFavouritesView && (
    activeSetCards.some((c) => c.rarity === 'Rare ex' && c.vmax === true)
    || (setConfig?.rarityTotals?.['Rare VMAX'] ?? 0) > 0
  );
  const hasVstar = !isFavouritesView && (
    activeSetCards.some((c) => c.rarity === 'Rare ex' && c.vstar === true)
    || (setConfig?.rarityTotals?.['Rare VSTAR'] ?? 0) > 0
  );
  const hasBreak = !isFavouritesView && (
    activeSetCards.some((c) => c.rarity === 'Rare BREAK')
    || (setConfig?.rarityTotals?.['Rare BREAK'] ?? 0) > 0
  );
  const hasMegaEx = !isFavouritesView && (
    activeSetCards.some((c) => c.rarity === 'Rare ex' && c.megaEx === true)
    || (setConfig?.rarityTotals?.['Mega EX'] ?? 0) > 0
  );
  const hasGraded = activeSetCards.some((c) => gradedCount(c) > 0);
  const orderedFilters = [
    'All',
    'Holo',
    ...(hasBreak ? ['BREAK'] : []),
    ...(hasEx ? ['EX'] : []),
    ...(hasGx ? ['GX'] : []),
    ...(hasV ? ['V'] : []),
    ...(hasVmax ? ['VMAX'] : []),
    ...(hasVstar ? ['VSTAR'] : []),
    ...(hasMegaEx ? ['MEGA EX'] : []),
    ...(hasLvx ? ['Rare LV.X'] : []),
    ...(hasShiny ? ['Rare Shiny'] : []),
    ...(hasRadiant ? ['Radiant Rare'] : []),
    ...(hasSecretRare ? ['Secret Rare'] : []),
    ...(hasUltraRare ? ['Ultra Rare'] : []),
    'Rare',
    'Uncommon',
    'Common',
    ...(hasGraded ? ['Graded'] : []),
  ];

  return (
    <>
      <div className="collection">
        <div className="collection__header">
          <div className="collection__header-top">
            <button className="coll-back-btn" onClick={() => {
              if (isSplitSubsetSet && activeSetSubset !== null) setActiveSetSubset(null);
              else setActiveSetId(null);
              setFilterType(null);
            }}>‹ Back</button>

            <div className="collection__stats">
              <span><strong>{activeSetCards.length}</strong><em> unique</em></span>
              <span className="collection__divider">•</span>
              <span><strong>{totalCards}</strong><em> total</em></span>
              {subsetLabel && (
                <>
                  <span className="collection__divider">•</span>
                  <span><strong>{subsetLabel}</strong></span>
                </>
              )}
              {!isFavouritesView && (
                <>
                  <span className="collection__divider">•</span>
                  <span><strong>{officialOwnedCount} / {checklistOfficialCount}</strong><em> set progress</em></span>
                </>
              )}
            </div>

            {!isFavouritesView && (
              <div className="collection__view-toggle" role="group" aria-label="Collection view mode">
                <button
                  className={`view-toggle-btn${viewMode === 'collection' ? ' view-toggle-btn--active' : ''}`}
                  onClick={() => setViewMode('collection')}
                >
                  My Cards
                </button>
                <button
                  className={`view-toggle-btn${viewMode === 'checklist' ? ' view-toggle-btn--active' : ''}`}
                  onClick={() => setViewMode('checklist')}
                >
                  Checklist
                </button>
              </div>
            )}
          </div>

          {viewMode === 'collection' && (
            <>
              <div className="collection__filters-row">
                <div className="collection__filters">
                  {orderedFilters.map((rarityKey) => (
                    <button
                      key={rarityKey}
                      className={`filter-tab ${FILTER_CLASS[rarityKey]}${filter === rarityKey ? ' filter-tab--active' : ''}`}
                      onClick={() => setFilter(rarityKey)}
                      title={rarityKey}
                      aria-label={rarityKey}
                    >
                      {FILTER_LABEL[rarityKey] ?? rarityKey}
                      <span className="filter-tab__count">
                        {rarityKey === 'All'
                          ? activeSetCards.length
                          : rarityKey === 'Holo'
                            ? activeSetCards.filter((c) => c.holo === true || c.reverseHolo === true).length
                            : rarityKey === 'EX'
                              ? activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.gx !== true && c.v !== true && c.vmax !== true && c.vstar !== true).length
                            : rarityKey === 'GX'
                              ? activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.gx === true).length
                            : rarityKey === 'V'
                              ? activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.v === true && c.vmax !== true && c.vstar !== true).length
                            : rarityKey === 'VMAX'
                              ? activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.vmax === true).length
                            : rarityKey === 'VSTAR'
                              ? activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.vstar === true).length
                            : rarityKey === 'MEGA EX'
                              ? activeSetCards.filter((c) => c.rarity === 'Rare ex' && c.megaEx === true).length
                            : rarityKey === 'BREAK'
                              ? activeSetCards.filter((c) => c.rarity === 'Rare BREAK').length
                              : rarityKey === 'Graded'
                                ? activeSetCards.reduce((sum, c) => sum + gradedCount(c), 0)
                              : activeSetCards.filter((c) => c.rarity === rarityKey).length}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="collection__sort-toggle" role="group" aria-label="Sort order">
                  <button
                    className={`sort-btn${sortBy === 'rarity' ? ' sort-btn--active' : ''}`}
                    onClick={() => setSortBy('rarity')}
                  >
                    Rarity
                  </button>
                  <button
                    className={`sort-btn${sortBy === 'count' ? ' sort-btn--active' : ''}`}
                    onClick={() => setSortBy('count')}
                  >
                    Count
                  </button>
                </div>
              </div>

              {economyMode && !isFavouritesView && activeSetCards.some((c) => {
                const totalCount = c.count ?? 1;
                const totalGraded = gradedCount(c);
                const totalUngraded = totalCount - totalGraded;
                const ungradedDupes = Math.max(totalUngraded - 1, 0);
                const gradedDupes = Math.max(totalGraded - 1, 0);
                return (ungradedDupes + gradedDupes) > 0;
              }) && (
                <div className="collection__sell-all-row">
                  <button
                    className="btn-coll-sell-all"
                    onClick={() => {
                      for (const card of activeSetCards) {
                        const totalCount = card.count ?? 1;
                        const totalGraded = gradedCount(card);
                        const totalUngraded = totalCount - totalGraded;
                        const ungradedDupes = Math.max(totalUngraded - 1, 0);
                        const gradedDupes = Math.max(totalGraded - 1, 0);
                        for (let i = 0; i < ungradedDupes; i += 1) onSellCard?.(card);
                        for (let i = 0; i < gradedDupes; i += 1) onSellCard?.(card);
                      }
                    }}
                  >
                    Sell All Duplicates ({activeSetCards.reduce((sum, c) => {
                      const totalCount = c.count ?? 1;
                      const totalGraded = gradedCount(c);
                      const totalUngraded = totalCount - totalGraded;
                      const ungradedDupes = Math.max(totalUngraded - 1, 0);
                      const gradedDupes = Math.max(totalGraded - 1, 0);
                      return sum + ungradedDupes + gradedDupes;
                    }, 0)})
                  </button>
                </div>
              )}

              {availableTypes.length > 0 && (
                <div className="collection__type-filter" role="group" aria-label="Filter by type">
                  <button
                    className={`type-chip${filterType === null ? ' type-chip--active' : ''}`}
                    onClick={() => setFilterType(null)}
                  >
                    All Types
                  </button>
                  {availableTypes.map((type) => (
                    <button
                      key={type}
                      className={`type-chip${filterType === type ? ' type-chip--active' : ''}`}
                      style={{ '--type-color': TYPE_COLORS[type] ?? '#94a3b8' }}
                      onClick={() => setFilterType(filterType === type ? null : type)}
                    >
                      <span className="type-chip__dot" />
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {viewMode === 'collection' ? (
          activeSetCards.length === 0 ? (
            <div className="collection__empty-inner">
              <div className="collection__empty-icon">{isFavouritesView ? '♥' : '🃏'}</div>
              <h2>{isFavouritesView ? 'No favourites yet' : `No ${setConfig?.name}${subsetLabel ? ` (${subsetLabel})` : ''} cards yet`}</h2>
              <p>{isFavouritesView ? 'Open a card and tap ♡ to favourite it.' : 'Open a pack to start collecting!'}</p>
            </div>
          ) : displayed.length === 0 ? (
            <p className="collection__none">No {filterType ? `${filterType}-type` : filter} cards yet.</p>
          ) : (
            <div className="collection__grid">
              {displayed.map((card) => (
                <div key={card.id} className="collection__card-wrap">
                  <div className="collection__card-inner">
                    <PokemonCard
                      card={card}
                      size="normal"
                      showCount={true}
                      onClick={setModalCard}
                      showGraded={filter === 'Graded'}
                    />
                    {favouriteIds.has(card.id) && <span className="coll-fav-badge" aria-label="Favourited">♥</span>}
                    {economyMode && (
                      (filter === 'Graded'
                        ? (card.totalGraded ?? 1) > 1 || (card.totalUngraded ?? 0) > 0
                        : (card.count ?? 1) > 1 && (card.totalUngraded ?? 0) > 0) && (
                        <button
                          className="btn-sell-card btn-sell-card--coll"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSellCard?.(card);
                          }}
                        >
                          🪙 {getCardSellPrice?.(card) ?? 0}
                        </button>
                      )
                    )}
                  </div>
                  <p className="collection__card-name">{card.name}</p>
                </div>
              ))}
            </div>
          )
        ) : isFavouritesView ? (
          <p className="collection__none">Checklist view is unavailable for favourites.</p>
        ) : isLoadingChecklist ? (
          <div className="collection__empty-inner">
            <div className="pokeball-spinner">
              <div className="pokeball-spinner__top" />
              <div className="pokeball-spinner__band" />
              <div className="pokeball-spinner__bottom" />
              <div className="pokeball-spinner__center" />
            </div>
            <p>Loading {setConfig?.name ?? 'set'}{subsetLabel ? ` (${subsetLabel})` : ''}...</p>
          </div>
        ) : checklistCards ? (
          <div className="collection__grid">
            {checklistCards.map((card) => {
              const isOwned = ownedIds.has(card.id);
              const isSecretRare = card.rarity === 'Secret Rare';
              return (
                <div key={card.id} className="collection__card-wrap">
                  <PokemonCard
                    card={card}
                    size="normal"
                    showCount={false}
                    onClick={isOwned ? setModalCard : undefined}
                    unowned={!isOwned && !isSecretRare}
                    secretUnowned={isSecretRare && !isOwned}
                    showGraded={false}
                  />
                  <p className={`collection__card-name${isOwned ? '' : (isSecretRare ? ' collection__card-name--mystery' : ' collection__card-name--unowned')}`}>
                    {isOwned ? card.name : '???'}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="collection__none">Open a pack from this set to load the full checklist.</p>
        )}
      </div>

      {modalCard && (
        <CardModal
          card={modalCard}
          onClose={() => setModalCard(null)}
          onFavouriteChange={refreshFavourites}
          onGradeCard={onGradeCard}
        />
      )}
    </>
  );
}
