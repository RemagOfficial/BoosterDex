import { useState, useMemo, useEffect, useRef } from 'react';
import { SETS } from '../services/sets.js';
import './SetSelector.css';

const BOOSTERDEX_MAIN_SET_ID = '__boosterdex_main__';
const BOOSTERDEX_SPECIAL_SET_ID = '__boosterdex_special__';

// Derive unique sorted series and years from SETS
function isSpecialExpansion(set) {
  return set?.expansionGroup === 'special';
}

function isOfficialNumberedCard(card, setConfig) {
  if (!setConfig?.totalCards) return true;
  const n = parseInt(String(card?.localId ?? ''), 10);
  if (Number.isNaN(n)) return false;
  return n <= setConfig.totalCards;
}

function toggle(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
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

export default function SetSelector({
  onSelect,
  setSymbols = {},
  collection = [],
  loadedSets = {},
  economyMode = false,
  boosterDexMainLoadedSetCount = 0,
  boosterDexMainLoadedCardCount = 0,
  boosterDexMainUnlocked = false,
  boosterDexMainProgress = 0,
  boosterDexMainTotal = 0,
  boosterDexSpecialLoadedSetCount = 0,
  boosterDexSpecialLoadedCardCount = 0,
  boosterDexSpecialUnlocked = false,
  boosterDexSpecialProgress = 0,
  boosterDexSpecialTotal = 0,
}) {
  const [showFilter, setShowFilter] = useState(false);
  const [selSeries,  setSelSeries]  = useState(() => new Set(loadStoredArray('pkmon_set_selector_series')));
  const [selYears,   setSelYears]   = useState(() => new Set(loadStoredArray('pkmon_set_selector_years')));
  const [boosterDexOnly, setBoosterDexOnly] = useState(() => {
    try { return localStorage.getItem('pkmon_set_selector_boosterdex') === '1'; } catch { return false; }
  });
  const [hideComplete, setHideComplete] = useState(() => {
    try { return localStorage.getItem('pkmon_set_selector_hide_complete') === '1'; } catch { return false; }
  });
  const [search, setSearch] = useState(() => {
    try { return localStorage.getItem('pkmon_set_selector_search') ?? ''; } catch { return ''; }
  });
  const [expansionView, setExpansionView] = useState(() => {
    try {
      const raw = localStorage.getItem('pkmon_set_selector_expansion_view');
      return raw === 'special' ? 'special' : 'main';
    } catch {
      return 'main';
    }
  });
  const popupRef = useRef(null);

  const scopedSets = useMemo(
    () => SETS.filter((set) => (expansionView === 'special' ? isSpecialExpansion(set) : !isSpecialExpansion(set))),
    [expansionView],
  );
  const allSeries = useMemo(() => [...new Set(scopedSets.map((s) => s.series))], [scopedSets]);
  const allYears = useMemo(() => [...new Set(scopedSets.map((s) => s.year))].sort(), [scopedSets]);

  // Close popup on outside click
  useEffect(() => {
    if (!showFilter) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setShowFilter(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showFilter]);

  useEffect(() => { saveStoredArray('pkmon_set_selector_series', [...selSeries]); }, [selSeries]);
  useEffect(() => { saveStoredArray('pkmon_set_selector_years', [...selYears]); }, [selYears]);
  useEffect(() => {
    try {
      if (boosterDexOnly) localStorage.setItem('pkmon_set_selector_boosterdex', '1');
      else localStorage.removeItem('pkmon_set_selector_boosterdex');
    } catch { /* ignore */ }
  }, [boosterDexOnly]);
  useEffect(() => {
    try {
      if (hideComplete) localStorage.setItem('pkmon_set_selector_hide_complete', '1');
      else localStorage.removeItem('pkmon_set_selector_hide_complete');
    } catch { /* ignore */ }
  }, [hideComplete]);
  useEffect(() => {
    try { localStorage.setItem('pkmon_set_selector_search', search); } catch { /* ignore */ }
  }, [search]);
  useEffect(() => {
    try { localStorage.setItem('pkmon_set_selector_expansion_view', expansionView); } catch { /* ignore */ }
  }, [expansionView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const mainMegaPack = {
      id: BOOSTERDEX_MAIN_SET_ID,
      name: 'BoosterDex Mega Pack (Main)',
      series: 'BoosterDex',
      year: economyMode ? 'Economy' : 'Sandbox',
      totalCards: boosterDexMainLoadedCardCount,
      symbol: '◆',
      accentColor: '#f59e0b',
      special: true,
      disabled: boosterDexMainLoadedSetCount === 0 || (economyMode && boosterDexMainUnlocked !== true),
    };

    const specialMegaPack = {
      id: BOOSTERDEX_SPECIAL_SET_ID,
      name: 'BoosterDex Mega Pack (Special)',
      series: 'BoosterDex',
      year: economyMode ? 'Economy' : 'Sandbox',
      totalCards: boosterDexSpecialLoadedCardCount,
      symbol: '◆',
      accentColor: '#ef4444',
      special: true,
      disabled: boosterDexSpecialLoadedSetCount === 0 || (economyMode && boosterDexSpecialUnlocked !== true),
    };

    const megaPack = expansionView === 'special' ? specialMegaPack : mainMegaPack;

    const regularSets = scopedSets.filter((s) => {
      if (selSeries.size > 0 && !selSeries.has(s.series)) return false;
      if (selYears.size  > 0 && !selYears.has(s.year))   return false;
      if (hideComplete) {
        const owned = collection.filter((c) => (
          (c.setId ?? 'base1') === s.id
          && !c.reverseHolo
          && isOfficialNumberedCard(c, s)
        )).length;
        const total = (loadedSets[s.id]?.filter((c) => !c.reverseHolo && isOfficialNumberedCard(c, s)).length) ?? s.totalCards;
        if (owned > 0 && owned >= total) return false;
      }
      if (q) {
        const hay = `${s.name} ${s.series} ${s.year}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });

    const megaHay = `${megaPack.name} ${megaPack.series} ${megaPack.year} mixed loaded sets`;
    const megaMatchesSearch = !q || megaHay.toLowerCase().includes(q);

    if (boosterDexOnly) {
      return megaMatchesSearch ? [megaPack] : [];
    }

    return megaMatchesSearch ? [megaPack, ...regularSets] : regularSets;
  }, [selSeries, selYears, search, economyMode, boosterDexOnly, hideComplete, scopedSets, expansionView, boosterDexMainLoadedSetCount, boosterDexMainLoadedCardCount, boosterDexMainUnlocked, boosterDexSpecialLoadedSetCount, boosterDexSpecialLoadedCardCount, boosterDexSpecialUnlocked, collection, loadedSets]);

  const activeCount = selSeries.size + selYears.size + (boosterDexOnly ? 1 : 0) + (hideComplete ? 1 : 0);
  const clearAll = () => {
    setSelSeries(new Set());
    setSelYears(new Set());
    setBoosterDexOnly(false);
    setHideComplete(false);
  };

  return (
    <div className="set-selector">
      <h2 className="set-selector__title">Choose a Set</h2>
      <p className="set-selector__sub">Select a booster pack to open</p>

      {/* Filter/search bar */}
      <div className="set-selector__bar-row">
        <div className="ss-filter-bar ss-filter-bar--fullwidth">
          <div className="ss-filter-bar__top">
            <button
              className={`ss-filter-btn${activeCount > 0 ? ' ss-filter-btn--active' : ''}`}
              onClick={() => setShowFilter((v) => !v)}
              aria-expanded={showFilter}
            >
              <span>Filter</span>
              {activeCount > 0 && <span className="ss-filter-badge">{activeCount}</span>}
            </button>
            <input
              className="ss-search-input"
              type="text"
              placeholder="Search sets by name, series, or year..."
              value={search}
              onChange={e => setSearch(e.target.value)}
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
          {activeCount > 0 && (
            <div className="ss-chips">
              {[...selSeries].map((s) => (
                <button key={s} className="ss-chip" onClick={() => setSelSeries(toggle(selSeries, s))}>
                  {s} &times;
                </button>
              ))}
              {[...selYears].map((y) => (
                <button key={y} className="ss-chip" onClick={() => setSelYears(toggle(selYears, y))}>
                  {y} &times;
                </button>
              ))}
              {boosterDexOnly && (
                <button className="ss-chip" onClick={() => setBoosterDexOnly(false)}>
                  BoosterDex &times;
                </button>
              )}
              {hideComplete && (
                <button className="ss-chip" onClick={() => setHideComplete(false)}>
                  Hide completed &times;
                </button>
              )}
              <button className="ss-chip ss-chip--clear" onClick={clearAll}>Clear all</button>
            </div>
          )}
        {showFilter && (
          <div className="ss-popup" ref={popupRef}>
            <div className="ss-popup__section">
              <span className="ss-popup__label">Series</span>
              <div className="ss-popup__options">
                {allSeries.map((s) => (
                  <button
                    key={s}
                    className={`ss-option${selSeries.has(s) ? ' ss-option--on' : ''}`}
                    onClick={() => setSelSeries(toggle(selSeries, s))}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="ss-popup__divider" />
            <div className="ss-popup__section">
              <span className="ss-popup__label">Year</span>
              <div className="ss-popup__options ss-popup__options--years">
                {allYears.map((y) => (
                  <button
                    key={y}
                    className={`ss-option${selYears.has(y) ? ' ss-option--on' : ''}`}
                    onClick={() => setSelYears(toggle(selYears, y))}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
            <>
              <div className="ss-popup__divider" />
              <div className="ss-popup__section">
                <span className="ss-popup__label">Special</span>
                <div className="ss-popup__options">
                  <button
                    className={`ss-option${boosterDexOnly ? ' ss-option--on' : ''}`}
                    onClick={() => setBoosterDexOnly((v) => !v)}
                  >
                    BoosterDex
                  </button>
                </div>
              </div>
            </>
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
            {activeCount > 0 && (
              <>
                <div className="ss-popup__divider" />
                <button className="ss-popup__clear" onClick={() => { clearAll(); setShowFilter(false); }}>
                  Clear all filters
                </button>
              </>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Set grid */}
      <div className="set-selector__grid">
        {filtered.length === 0 ? (
          <p className="ss-no-results">No sets match the current filters.</p>
        ) : filtered.map((set) => (
          <button
            key={set.id}
            className={`set-card${set.special ? ' set-card--special' : ''}`}
            style={{ '--accent': set.accentColor }}
            disabled={set.disabled === true}
            onClick={() => onSelect(set.id)}
          >
            <div className="set-card__shine" />
            <div className="set-card__top">
              {setSymbols[set.id] ? (
                <img
                  className="set-card__symbol-img"
                  src={setSymbols[set.id]}
                  alt={`${set.name} symbol`}
                  draggable={false}
                />
              ) : (
                <span className={`set-card__symbol${set.symbol.length > 1 ? ' set-card__symbol--emoji' : ''}`}>
                  {set.symbol}
                </span>
              )}
            </div>
            <div className="set-card__body">
              <span className="set-card__name">{set.name}</span>
              <span className="set-card__year">{set.series} &middot; {set.year}</span>
            </div>
            <div className="set-card__footer">
              <span className="set-card__count">
                {set.id === BOOSTERDEX_MAIN_SET_ID || set.id === BOOSTERDEX_SPECIAL_SET_ID
                  ? economyMode
                    ? (set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialUnlocked : boosterDexMainUnlocked)
                      ? (set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialLoadedSetCount : boosterDexMainLoadedSetCount) > 0
                        ? `${set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialLoadedSetCount : boosterDexMainLoadedSetCount} available set${(set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialLoadedSetCount : boosterDexMainLoadedSetCount) === 1 ? '' : 's'}`
                        : 'No cached sets yet'
                      : `Locked: ${set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialProgress : boosterDexMainProgress}/${set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialTotal : boosterDexMainTotal} packs opened`
                    : (set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialLoadedSetCount : boosterDexMainLoadedSetCount) > 0
                      ? `${set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialLoadedSetCount : boosterDexMainLoadedSetCount} available set${(set.id === BOOSTERDEX_SPECIAL_SET_ID ? boosterDexSpecialLoadedSetCount : boosterDexMainLoadedSetCount) === 1 ? '' : 's'}`
                      : 'No cached sets yet'
                  : `${set.totalCards} cards`}
              </span>
              <span className="set-card__arrow">&#x203a;</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}