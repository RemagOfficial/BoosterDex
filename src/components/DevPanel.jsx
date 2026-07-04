import { useState, useMemo, useEffect } from 'react';
import './DevPanel.css';
import { openPack } from '../services/packLogic.js';

const SAMPLE_TOASTS = [
  { id: '__dev-common__',    rarity: 'Common',    icon: '○', title: 'Common Ground',  setName: 'Dev Test', packs: 0 },
  { id: '__dev-uncommon__',  rarity: 'Uncommon',  icon: '◇', title: 'Uncommon Find',  setName: 'Dev Test', packs: 0 },
  { id: '__dev-rare__',      rarity: 'Rare',      icon: '★', title: 'Rare Treasure',  setName: 'Dev Test', packs: 0 },
  { id: '__dev-holo__',      rarity: 'Rare Holo', icon: '✦', title: 'Holo Hunter',    setName: 'Dev Test', packs: 0 },
];

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Rare ex', 'Ultra Rare', 'Rare Holo', 'Secret Rare', 'Reverse Holo'];

function getCardVariantLabel(card) {
  if (!card) return 'Unknown';

  const details = [];
  if (card.reverseHolo === true) details.push('Reverse Holo');
  else if (card.holo === true) details.push('Holo');
  else details.push('Normal');

  if (card.megaEx) details.push('Mega EX');
  if (card.gx) details.push('GX');
  if (card.vmax) details.push('VMAX');
  else if (card.vstar) details.push('VSTAR');
  else if (card.v) details.push('V');
  if (card.rarity === 'Rare BREAK') details.push('BREAK');
  if (card.rarity === 'Radiant Rare') details.push('Radiant');
  if (card.rarity === 'Secret Rare') details.push('Secret');
  if (card.rarity === 'Ultra Rare') details.push('Ultra Rare');
  if (card.localId) details.push(String(card.localId));

  return details.join(' • ');
}

export default function DevPanel({
  onClose,
  coins = 0,
  onFireToast,
  onFireSetComplete,
  forcedPack,
  onSetForcedPack,
  onClearForcedPack,
  currentSetCards,
  currentSetName,
  onClearAchievements,
  onClearCaches,
  onAwardFreePacks,
  onSetCoins,
  onReopenTutorial,
  collection,
  onSetCollectionCardGrade,
  difficultyCostMultiplierOverride = null,
  onSetDifficultyCostMultiplierOverride,
  onMaxPity,
}) {
  const [tab, setTab]           = useState('toasts');
  const [cardFilter, setCardFilter] = useState('');
  const [draftPack, setDraftPack]   = useState([]);
  const [gradeCardFilter, setGradeCardFilter] = useState('');
  const [gradeCardId, setGradeCardId] = useState('');
  const [gradeValue, setGradeValue] = useState(10);
  const [gradeStatus, setGradeStatus] = useState('');
  const [coinDraft, setCoinDraft] = useState(coins);
  const [multiplierDraft, setMultiplierDraft] = useState(() => {
    if (Number.isFinite(Number(difficultyCostMultiplierOverride))) {
      return String(Math.max(1, Math.floor(Number(difficultyCostMultiplierOverride))));
    }
    return '1';
  });
  const [simResults, setSimResults] = useState(null);
  const [simRunning, setSimRunning] = useState(false);
  const [expandedRarity, setExpandedRarity] = useState(null);

  // Sort and filter cards for the picker
  const filteredCards = useMemo(() => {
    if (!currentSetCards) return [];
    const q = cardFilter.toLowerCase().trim();
    const pool = q
      ? currentSetCards.filter(
          (c) => c.name?.toLowerCase().includes(q) || c.rarity?.toLowerCase().includes(q)
        )
      : currentSetCards;
    // Sort by rarity tier then name
    return [...pool]
      .sort((a, b) => {
        const ri = (r) => RARITY_ORDER.indexOf(r) === -1 ? 99 : RARITY_ORDER.indexOf(r);
        return ri(a.rarity) - ri(b.rarity) || (a.name ?? '').localeCompare(b.name ?? '');
      })
      .slice(0, 80);
  }, [currentSetCards, cardFilter]);

  const gradeCandidates = useMemo(() => {
    const list = Array.isArray(collection) ? collection : [];
    const q = gradeCardFilter.toLowerCase().trim();
    const pool = q
      ? list.filter((c) => c.name?.toLowerCase().includes(q) || (c.setId ?? '').toLowerCase().includes(q))
      : list;
    return [...pool]
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      .slice(0, 120);
  }, [collection, gradeCardFilter]);

  useEffect(() => {
    if (gradeCandidates.length === 0) {
      setGradeCardId('');
      return;
    }
    if (!gradeCandidates.some((c) => c.id === gradeCardId)) {
      setGradeCardId(gradeCandidates[0].id);
    }
  }, [gradeCandidates, gradeCardId]);

  useEffect(() => {
    setCoinDraft(coins);
  }, [coins]);

  useEffect(() => {
    if (Number.isFinite(Number(difficultyCostMultiplierOverride))) {
      setMultiplierDraft(String(Math.max(1, Math.floor(Number(difficultyCostMultiplierOverride)))));
    } else {
      setMultiplierDraft('1');
    }
  }, [difficultyCostMultiplierOverride]);

  const selectedGradeCard = useMemo(
    () => (collection ?? []).find((c) => c.id === gradeCardId) ?? null,
    [collection, gradeCardId],
  );

  const selectedGradeCardStats = useMemo(() => {
    if (!selectedGradeCard) return null;
    const graded = selectedGradeCard.graded ?? {};
    const gradedTotal = Object.values(graded).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    const total = selectedGradeCard.count ?? 1;
    return {
      total,
      gradedTotal,
      ungraded: Math.max(0, total - gradedTotal),
    };
  }, [selectedGradeCard]);

  const addToDraft = (card) => {
    if (draftPack.length >= 10) return;
    setDraftPack((prev) => [...prev, card]);
  };

  const removeFromDraft = (idx) => {
    setDraftPack((prev) => prev.filter((_, i) => i !== idx));
  };

  const queuePack = () => {
    if (draftPack.length === 0) return;
    onSetForcedPack([...draftPack]);
    setDraftPack([]);
  };

  const applyForcedGrade = () => {
    if (!gradeCardId || !onSetCollectionCardGrade) return;
    const ok = onSetCollectionCardGrade(gradeCardId, gradeValue);
    setGradeStatus(ok ? `Applied grade ${gradeValue}.` : 'Could not apply grade.');
  };

  const applyDifficultyCostMultiplier = () => {
    if (!onSetDifficultyCostMultiplierOverride) return;
    const value = Math.max(1, Math.floor(Number(multiplierDraft) || 1));
    setMultiplierDraft(String(value));
    onSetDifficultyCostMultiplierOverride(value);
  };

  const runSimulation = async () => {
    if (!currentSetCards || currentSetCards.length === 0) return;
    setSimRunning(true);
    setSimResults(null);
    setExpandedRarity(null);

    const iterations = 10000;
    const rarityCounts = {};
    const cardCounts = {};
    const cardsByRarity = {};

    // Use setTimeout to allow UI to update before blocking
    setTimeout(() => {
      for (let i = 0; i < iterations; i++) {
        const pack = openPack(currentSetCards, null, { ownedIds: null });
        pack.forEach(card => {
          const rarity = card.rarity || 'Unknown';
          rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;
          cardCounts[card.id] = (cardCounts[card.id] || 0) + 1;
          
          // Group cards by rarity for breakdown
          if (!cardsByRarity[rarity]) {
            cardsByRarity[rarity] = {};
          }
          const cardKey = [
            card.id,
            card.name,
            card.holo ? 'holo' : 'normal',
            card.reverseHolo ? 'reverse' : 'base',
            card.megaEx ? 'mega' : '',
            card.gx ? 'gx' : '',
            card.v ? 'v' : '',
            card.vmax ? 'vmax' : '',
            card.vstar ? 'vstar' : '',
          ].join('::');

          if (!cardsByRarity[rarity][cardKey]) {
            cardsByRarity[rarity][cardKey] = { card, count: 0 };
          }
          cardsByRarity[rarity][cardKey].count += 1;
        });
      }

      setSimResults({ iterations, rarityCounts, cardCounts, cardsByRarity });
      setSimRunning(false);
    }, 100);
  };

  const RARITY_COLORS = {
    'Common': '#94a3b8', 'Uncommon': '#10b981', 'Rare': '#f59e0b',
    'Rare ex': '#f97316', 'Ultra Rare': '#fb7185', 'Rare Holo': '#a855f7', 'Secret Rare': '#f43f5e',
  };

  return (
    <div className="dev-panel">
      <div className="dev-panel__header">
        <span className="dev-panel__badge">DEV</span>
        <span className="dev-panel__title">Developer Panel</span>
        <button className="dev-panel__close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="dev-panel__tabs">
        {[['toasts', '🔔', 'Toasts'], ['pack', '📦', 'Pack'], ['sim', '📊', 'Sim'], ['misc', '🔧', 'Misc']].map(([id, icon, label]) => (
          <button
            key={id}
            className={`dev-tab${tab === id ? ' dev-tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="dev-panel__content">

        {/* ── Toasts tab ── */}
        {tab === 'toasts' && (
          <div className="dev-section">
            <p className="dev-label">Fire achievement toast by tier</p>
            <div className="dev-toast-grid">
              {SAMPLE_TOASTS.map((t) => (
                <button
                  key={t.rarity}
                  className="dev-btn"
                  style={{ '--accent': RARITY_COLORS[t.rarity] }}
                  onClick={() => onFireToast({ ...t, id: `__dev-${Date.now()}__` })}
                >
                  <span>{t.icon}</span>
                  <span>{t.rarity}</span>
                </button>
              ))}
            </div>
            <div className="dev-divider" />
            <p className="dev-label">Modal events</p>
            <button className="dev-btn dev-btn--wide" onClick={onFireSetComplete}>
              ◆ Set Complete Modal
            </button>
          </div>
        )}

        {/* ── Pack tab ── */}
        {tab === 'pack' && (
          <div className="dev-section">
            {forcedPack ? (
              <>
                <p className="dev-label">📦 Queued pack — {forcedPack.length} card{forcedPack.length !== 1 ? 's' : ''}</p>
                <p className="dev-hint">Will be used on next pack open, then cleared.</p>
                <div className="dev-chip-list">
                  {forcedPack.map((c, i) => (
                    <span key={i} className="dev-chip" style={{ '--accent': RARITY_COLORS[c.rarity] ?? '#64748b' }}>
                      {c.name}
                    </span>
                  ))}
                </div>
                <button className="dev-btn dev-btn--danger dev-btn--wide" onClick={onClearForcedPack}>
                  Clear Queue
                </button>
              </>
            ) : (
              <>
                <p className="dev-label">
                  Draft pack{currentSetName ? ` — ${currentSetName}` : ''}&nbsp;
                  <span className="dev-count">{draftPack.length}/10</span>
                </p>
                {!currentSetCards && (
                  <p className="dev-hint">Load a set first to pick cards.</p>
                )}
                {draftPack.length > 0 && (
                  <div className="dev-chip-list dev-chip-list--draft">
                    {draftPack.map((c, i) => (
                      <span key={i} className="dev-chip" style={{ '--accent': RARITY_COLORS[c.rarity] ?? '#64748b' }}>
                        {c.name}
                        <button className="dev-chip__remove" onClick={() => removeFromDraft(i)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  className="dev-input"
                  placeholder="Filter by name or rarity…"
                  value={cardFilter}
                  onChange={(e) => setCardFilter(e.target.value)}
                  disabled={!currentSetCards}
                />
                <div className="dev-card-list">
                  {filteredCards.map((c) => (
                    <button
                      key={c.id}
                      className="dev-card-row"
                      disabled={draftPack.length >= 10}
                      onClick={() => addToDraft(c)}
                    >
                      <span className="dev-card-row__name">{c.name}</span>
                      <span
                        className="dev-card-row__rarity"
                        style={{ color: RARITY_COLORS[c.rarity] ?? '#64748b' }}
                      >
                        {c.rarity ?? '?'}
                      </span>
                    </button>
                  ))}
                  {currentSetCards && filteredCards.length === 0 && (
                    <p className="dev-hint dev-hint--center">No cards match</p>
                  )}
                </div>
                <button
                  className="dev-btn dev-btn--primary dev-btn--wide"
                  onClick={queuePack}
                  disabled={draftPack.length === 0}
                >
                  Queue This Pack
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Sim tab ── */}
        {tab === 'sim' && (
          <div className="dev-section">
            <p className="dev-label">Pack Simulation</p>
            <p className="dev-hint">Simulate 10,000 pack openings for the current set to analyze rarity distribution.</p>
            {!currentSetCards && (
              <p className="dev-hint">Load a set first to run simulation.</p>
            )}
            <button
              className="dev-btn dev-btn--primary dev-btn--wide"
              onClick={runSimulation}
              disabled={simRunning || !currentSetCards}
            >
              {simRunning ? 'Running...' : 'Run 10,000 Simulations'}
            </button>
            {simResults && (
              <>
                <div className="dev-divider" />
                <p className="dev-label">Results ({simResults.iterations.toLocaleString()} packs)</p>
                <div className="dev-sim-results">
                  {Object.entries(simResults.rarityCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([rarity, count]) => {
                      const percentage = ((count / (simResults.iterations * 10)) * 100).toFixed(2);
                      const isExpanded = expandedRarity === rarity;
                      return (
                        <div key={rarity}>
                          <div 
                            className="dev-sim-row dev-sim-row--clickable"
                            onClick={() => setExpandedRarity(isExpanded ? null : rarity)}
                          >
                            <span className="dev-sim-row__rarity" style={{ color: RARITY_COLORS[rarity] ?? '#64748b' }}>
                              {isExpanded ? '▼ ' : '▶ '}{rarity}
                            </span>
                            <span className="dev-sim-row__count">{count.toLocaleString()}</span>
                            <span className="dev-sim-row__percent">{percentage}%</span>
                          </div>
                          {isExpanded && simResults.cardsByRarity[rarity] && (
                            <div className="dev-sim-breakdown">
                              {Object.entries(simResults.cardsByRarity[rarity])
                                .sort(([, a], [, b]) => b.count - a.count)
                                .map(([cardKey, { card, count: cardCount }]) => {
                                  const cardPercent = ((cardCount / count) * 100).toFixed(1);
                                  return (
                                    <div key={cardKey} className="dev-sim-card-row">
                                      <div className="dev-sim-card-row__meta">
                                        <span className="dev-sim-card-row__name">{card.name}</span>
                                        <span className="dev-sim-card-row__details">{getCardVariantLabel(card)}</span>
                                      </div>
                                      <span className="dev-sim-card-row__count">{cardCount.toLocaleString()}</span>
                                      <span className="dev-sim-card-row__percent">{cardPercent}%</span>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Misc tab ── */}
        {tab === 'misc' && (
          <div className="dev-section">
            <p className="dev-label">Achievements</p>
            <button className="dev-btn dev-btn--danger dev-btn--wide" onClick={onClearAchievements}>
              Reset Claimed Achievements
            </button>
            <button className="dev-btn dev-btn--danger dev-btn--wide" onClick={onClearCaches}>
              Clear Card Caches
            </button>
            <div className="dev-divider" />
            <p className="dev-label">Economy</p>
            {[1, 5, 10].map((n) => (
              <button key={n} className="dev-btn dev-btn--wide" onClick={() => onAwardFreePacks(n)}>
                🎁 Award {n} free pack{n !== 1 ? 's' : ''}
              </button>
            ))}
            <div className="dev-divider" />
            <p className="dev-label">Difficulty Cost Multiplier</p>
            <p className="dev-hint">Overrides progression scaling for economy difficulty switch price tests.</p>
            <input
              className="dev-input"
              type="number"
              min="1"
              step="1"
              value={multiplierDraft}
              onChange={(e) => setMultiplierDraft(e.target.value)}
            />
            <div className="dev-toast-grid">
              <button className="dev-btn dev-btn--primary" onClick={applyDifficultyCostMultiplier}>
                Apply Multiplier
              </button>
              <button className="dev-btn" onClick={() => onSetDifficultyCostMultiplierOverride?.(null)}>
                Use Auto Scale
              </button>
            </div>
            <div className="dev-toast-grid">
              {[1, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  className="dev-btn"
                  onClick={() => {
                    setMultiplierDraft(String(n));
                    onSetDifficultyCostMultiplierOverride?.(n);
                  }}
                >
                  {n}x
                </button>
              ))}
            </div>
            <p className="dev-hint">
              Active: {Number.isFinite(Number(difficultyCostMultiplierOverride)) ? `${Math.floor(Number(difficultyCostMultiplierOverride))}x (override)` : 'Auto (progress-based)'}
            </p>
            <div className="dev-divider" />
            <p className="dev-label">Coins</p>
            <p className="dev-hint">Set the exact balance or apply quick adjustments.</p>
            <input
              className="dev-input"
              type="number"
              min="0"
              step="1"
              value={coinDraft}
              onChange={(e) => setCoinDraft(e.target.value === '' ? '' : Number(e.target.value))}
            />
            <div className="dev-toast-grid">
              <button className="dev-btn dev-btn--primary" onClick={() => onSetCoins?.(Number(coinDraft) || 0)}>
                Set Balance
              </button>
              <button className="dev-btn" onClick={() => onSetCoins?.(Math.max(0, coins + 1000))}>
                +1,000
              </button>
              <button className="dev-btn" onClick={() => onSetCoins?.(Math.max(0, coins - 1000))}>
                -1,000
              </button>
            </div>
            <button className="dev-btn dev-btn--wide" onClick={onMaxPity}>
              ✦ Fill Pity Meter (→ 10/10)
            </button>
            <div className="dev-divider" />
            <p className="dev-label">Tutorial</p>
            <button className="dev-btn dev-btn--wide" onClick={onReopenTutorial}>
              📖 Reopen Tutorial
            </button>
            <div className="dev-divider" />
            <p className="dev-label">Force Grade (No Animation)</p>
            <p className="dev-hint">Pick any owned card and directly assign one copy to a chosen grade.</p>
            <input
              className="dev-input"
              placeholder="Filter owned cards by name or set id…"
              value={gradeCardFilter}
              onChange={(e) => setGradeCardFilter(e.target.value)}
            />
            <select
              className="dev-select"
              value={gradeCardId}
              onChange={(e) => setGradeCardId(e.target.value)}
              disabled={gradeCandidates.length === 0}
            >
              {gradeCandidates.length === 0 && <option value="">No cards in collection</option>}
              {gradeCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} x{c.count ?? 1}
                </option>
              ))}
            </select>
            <select
              className="dev-select"
              value={gradeValue}
              onChange={(e) => setGradeValue(Number(e.target.value))}
              disabled={gradeCandidates.length === 0}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>
            {selectedGradeCardStats && (
              <p className="dev-hint">
                Owned: {selectedGradeCardStats.total} · Graded: {selectedGradeCardStats.gradedTotal} · Ungraded: {selectedGradeCardStats.ungraded}
              </p>
            )}
            <button
              className="dev-btn dev-btn--primary dev-btn--wide"
              onClick={applyForcedGrade}
              disabled={!gradeCardId}
            >
              Apply Grade Now
            </button>
            {gradeStatus && <p className="dev-hint">{gradeStatus}</p>}
          </div>
        )}

      </div>

      <div className="dev-panel__footer">
        Ctrl+Shift+D to toggle · not for production
      </div>
    </div>
  );
}
