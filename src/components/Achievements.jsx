import { useState, useMemo, useRef, useEffect } from 'react';
import { ACHIEVEMENT_SETS, computeProgress, getAchievementReward } from '../services/achievements.js';
import { SETS } from '../services/sets.js';
import './Achievements.css';
import './SetSelector.css';

function isSpecialExpansion(set) {
  return set?.expansionGroup === 'special';
}

function toggleSet(set, value) {
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

const RARITY_CLASS = {
  'Common':   'rarity--common',
  'Uncommon': 'rarity--uncommon',
  'Rare':     'rarity--rare',
  'Rare Holo':'rarity--rare-holo',
  'Rare BREAK':'rarity--rare-break',
  'Ultra Rare':'rarity--ultra-rare',
  'Rare LV.X':'rarity--rare-lvx',
  'Rare Shiny':'rarity--rare-shiny',
  null:       'rarity--master',
  'all-variants':'rarity--master',
};

export default function Achievements({ collection, allCards, economyMode = false }) {
  const [activeSet, setActiveSet] = useState(() => loadStoredValue('pkmon_ach_active_set', null));
  const [showFilter, setShowFilter] = useState(false);
  const [selSeries, setSelSeries] = useState(() => new Set(loadStoredArray('pkmon_ach_series')));
  const [selYears,  setSelYears]  = useState(() => new Set(loadStoredArray('pkmon_ach_years')));
  const [hideComplete, setHideComplete] = useState(() => loadStoredValue('pkmon_ach_hide_complete', false));
  const [search, setSearch] = useState(() => loadStoredValue('pkmon_ach_search', ''));
  const [expansionView, setExpansionView] = useState(() => loadStoredValue('pkmon_ach_expansion_view', 'main'));
  const filterPopupRef = useRef(null);

  useEffect(() => { saveStoredValue('pkmon_ach_active_set', activeSet); }, [activeSet]);
  useEffect(() => { saveStoredArray('pkmon_ach_series', [...selSeries]); }, [selSeries]);
  useEffect(() => { saveStoredArray('pkmon_ach_years', [...selYears]); }, [selYears]);
  useEffect(() => { saveStoredValue('pkmon_ach_hide_complete', hideComplete); }, [hideComplete]);
  useEffect(() => { saveStoredValue('pkmon_ach_search', search); }, [search]);
  useEffect(() => { saveStoredValue('pkmon_ach_expansion_view', expansionView); }, [expansionView]);

  useEffect(() => {
    if (!showFilter) return;
    const handler = (e) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(e.target)) setShowFilter(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showFilter]);

  const progress = useMemo(
    () => (allCards ? computeProgress(allCards, collection) : new Map()),
    [allCards, collection],
  );

  // ── Set list view ────────────────────────────────────────────────────────
  const activeFilterCount = selSeries.size + selYears.size + (hideComplete ? 1 : 0);
  const clearAllFilters = () => { setSelSeries(new Set()); setSelYears(new Set()); setHideComplete(false); };
  const setMeta = Object.fromEntries(SETS.map((s) => [s.id, s]));
  const scopedSets = useMemo(
    () => SETS.filter((set) => (expansionView === 'special' ? isSpecialExpansion(set) : !isSpecialExpansion(set))),
    [expansionView],
  );
  const seriesOptions = useMemo(() => [...new Set(scopedSets.map((s) => s.series))], [scopedSets]);
  const yearOptions = useMemo(() => [...new Set(scopedSets.map((s) => s.year))].sort(), [scopedSets]);
  const visibleAchSets = ACHIEVEMENT_SETS.filter((set) => {
    const meta = setMeta[set.tcgdexId];
    const series = meta?.series ?? set.series ?? '';
    const year = meta?.year ?? set.year ?? '';
    if (meta && expansionView === 'special' && !isSpecialExpansion(meta)) return false;
    if (meta && expansionView === 'main' && isSpecialExpansion(meta)) return false;
    if (selSeries.size > 0 && !selSeries.has(series)) return false;
    if (selYears.size  > 0 && !selYears.has(year))   return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${set.name} ${series} ${year}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (hideComplete) {
      const total = set.achievements.length;
      const complete = set.achievements.filter((a) => progress.get(a.id)?.complete).length;
      if (complete >= total) return false;
    }
    return true;
  });

  if (!activeSet) {
    return (
      <div className="ach-screen">
        <h2 className="ach-screen__title">Achievements</h2>
        <div className="ach-bar-row">
          <div className="ss-filter-bar ss-filter-bar--fullwidth">
            <div className="ss-filter-bar__top">
              <button
                className={`ss-filter-btn${activeFilterCount > 0 ? ' ss-filter-btn--active' : ''}`}
                onClick={() => setShowFilter((v) => !v)}
                aria-expanded={showFilter}
                style={{ marginRight: 8 }}
              >
                <span>Filter</span>
                {activeFilterCount > 0 && <span className="ss-filter-badge">{activeFilterCount}</span>}
              </button>
              <input
                className="ss-search-input"
                type="text"
                placeholder="Search sets by name, series, or year..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1 }}
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
        <div className="ach-set-list">
          {visibleAchSets.map((set) => {
            const total    = set.achievements.length;
            const complete = set.achievements.filter((a) => progress.get(a.id)?.complete).length;
            const allDone  = complete === total;
            return (
              <button
                key={set.id}
                className={`ach-set-card${allDone ? ' ach-set-card--complete' : ''}`}
                onClick={() => setActiveSet(set.id)}
              >
                <div className="ach-set-card__body">
                  <span className="ach-set-card__name">{set.name}</span>
                  <span className="ach-set-card__year">{set.year}</span>
                </div>
                <div className="ach-set-card__meta">
                  <span className={`ach-set-card__count${allDone ? ' ach-set-card__count--done' : ''}`}>
                    {allDone ? '✓ ' : ''}{complete} / {total}
                  </span>
                  <div className="ach-set-card__bar">
                    <div
                      className={`ach-set-card__bar-fill${allDone ? ' ach-set-card__bar-fill--done' : ''}`}
                      style={{ width: `${(complete / total) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="ach-set-card__arrow">›</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Set detail view ──────────────────────────────────────────────────────
  const set = ACHIEVEMENT_SETS.find((s) => s.id === activeSet);
  return (
    <div className="ach-screen">
      <div className="ach-detail-header">
        <button className="ach-back-btn" onClick={() => setActiveSet(null)}>‹ Back</button>
        <h2 className="ach-screen__title">{set.name}</h2>
      </div>
      <div className="ach-list">
        {set.achievements.map((ach) => {
          const prog = progress.get(ach.id) ?? { total: 0, owned: 0, complete: false };
          const pct  = prog.total > 0 ? (prog.owned / prog.total) * 100 : 0;
          return (
            <div
              key={ach.id}
              className={`ach-item${prog.complete ? ' ach-item--complete' : ''}`}
            >
              <div className={`ach-item__icon ${RARITY_CLASS[ach.rarity]}`}>
                {prog.complete ? '✓' : ach.icon}
              </div>
              <div className="ach-item__body">
                <div className="ach-item__title">
                  {ach.title}
                  {economyMode && (
                    <span className="ach-item__reward">
                      🎁 {getAchievementReward(ach)}
                    </span>
                  )}
                </div>
                <div className="ach-item__desc">{ach.description}</div>
                <div className="ach-item__progress-row">
                  <div className="ach-item__bar">
                    <div
                      className={`ach-item__bar-fill${prog.complete ? ' ach-item__bar-fill--done' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="ach-item__fraction">
                    {prog.owned} / {prog.total}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
