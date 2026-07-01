import { useState, useCallback, useEffect, useRef } from 'react';
import { openPack, openPityPack } from '../services/packLogic.js';
import { PITY_THRESHOLD } from '../services/pity.js';
import { BOOSTER_BOX_SIZE, BOOSTER_BOX_MULTIPLIER } from '../services/economy.js';
import { recordPackOpened } from '../services/stats.js';
import { getCardImageUrl } from '../services/tcgdex.js';
import CardModal from './CardModal.jsx';
import PokemonCard from './PokemonCard.jsx';
import './PackOpener.css';
import cardBackImg from '../assets/back_of_card.webp';

// ── Card back ─────────────────────────────────────────────────────────────────
function CardBack() {
  return <img className="card-back" src={cardBackImg} alt="Card back" draggable={false} />;
}

// ── Pack graphic ──────────────────────────────────────────────────────────────
function PackGraphic({ state, setName, onClick }) {
  return (
    <div
      className={`pack-graphic pack-graphic--${state}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="pack-graphic__inner">
        <div className="pack-graphic__foil" />
        <div className="pack-graphic__header"><span>{setName ? setName.toUpperCase() : 'BASE SET'}</span></div>
        <div className="pack-graphic__art">
          <div className="pack-graphic__diamond">&#9830;</div>
        </div>
        <div className="pack-graphic__footer">
          <span>Pokémon Trading Card Game</span>
        </div>
        <div className="pack-graphic__tear" />
      </div>
    </div>
  );
}

// ── Main PackOpener ───────────────────────────────────────────────────────────
// phases: idle → opening → revealing → summary
//
// cardState (during revealing): facedown → flipping → faceup → hiding
export default function PackOpener({
  cards, setName, setId, onCardsAdded, collection, onChangeSet,
  // Economy mode props
  economyMode = false, coins = 0, packPrice = 100,
  onBuyPack, onSellCard, getCardSellPrice,
  canCoinFlip = false, onCoinFlip,
  freePacks = 0, onUseFreePack,
    onBuyBox,
  // Dev mode
  forcedPack = null, onPackUsed,
  duplicatePullWeight = null,
  // Pity system (economy mode)
  pityCount = 0, onPityUpdate,
}) {
  const [phase,        setPhase]        = useState('idle');
  const [packCards,    setPackCards]    = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // cardState drives the flip + dismiss animation for the active card
  const [cardState,    setCardState]    = useState('facedown');
  const [modalCard,    setModalCard]    = useState(null);
  const [soldIndices,  setSoldIndices]  = useState(() => new Set());

  // Keep a ref so timers can read up-to-date packCards.length without stale closure
  const packCardsRef = useRef([]);
  // Stable ref for onCardsAdded so the hiding timer never holds a stale closure
  const onCardsAddedRef = useRef(onCardsAdded);
  useEffect(() => { onCardsAddedRef.current = onCardsAdded; }, [onCardsAdded]);
  // Snapshot of owned card IDs at the moment the pack was opened
  const preOpenCollectionRef = useRef(new Set());
  const collectionRef = useRef(collection);
  useEffect(() => { collectionRef.current = collection; }, [collection]);
  const openingTimerRef = useRef(null);
  const revealTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const holoRevealTimerRef = useRef(null);

  const clearTimers = useCallback(() => {
    clearTimeout(openingTimerRef.current);
    clearTimeout(revealTimerRef.current);
    clearTimeout(hideTimerRef.current);
    clearTimeout(holoRevealTimerRef.current);
    openingTimerRef.current = null;
    revealTimerRef.current = null;
    hideTimerRef.current = null;
    holoRevealTimerRef.current = null;
  }, []);

  // ── State-machine side-effects ────────────────────────────────────────────
  // When card reaches 'faceup', auto-dismiss after 2 s
  useEffect(() => {
    if (cardState !== 'faceup') return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setCardState('hiding'), 2000);
    return () => clearTimeout(hideTimerRef.current);
  }, [cardState]);

  // Holo rare: buildup animation plays for 1.1 s before the card flips
  useEffect(() => {
    if (cardState !== 'holoReveal') return;
    holoRevealTimerRef.current = setTimeout(() => setCardState('faceup'), 1100);
    return () => clearTimeout(holoRevealTimerRef.current);
  }, [cardState]);

  // Secret Rare: longer shake-buildup (1.8 s) before the flip
  useEffect(() => {
    if (cardState !== 'secretReveal') return;
    holoRevealTimerRef.current = setTimeout(() => setCardState('faceup'), 1800);
    return () => clearTimeout(holoRevealTimerRef.current);
  }, [cardState]);

  // When dismiss animation ends, advance to the next card (or summary)
  useEffect(() => {
    if (cardState !== 'hiding') return;
    clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      const nextIndex = currentIndex + 1;

      if (nextIndex >= packCardsRef.current.length) {
        onCardsAddedRef.current(packCardsRef.current);
        requestAnimationFrame(() => setPhase('summary'));
        return;
      }

      // Batch both updates in the same rAF so there's no intermediate render
      // where the old card loses its hiding animation and flashes visible.
      requestAnimationFrame(() => {
        setCardState('facedown');
        setCurrentIndex(nextIndex);
      });
    }, 450); // matches CSS hide animation duration
    return () => clearTimeout(revealTimerRef.current);
  }, [cardState]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleOpenPack = useCallback((free = false) => {
    if (economyMode) {
      if (free) onUseFreePack?.();
      else onBuyPack?.();
    }
    setSoldIndices(new Set());
    clearTimers();
    preOpenCollectionRef.current = new Set(collectionRef.current.map((c) => c.id));
    const isPityPack = economyMode && !forcedPack && pityCount >= PITY_THRESHOLD;
    let ownedIds = null;
    let ownedWeight = 0.8;
    if (free && economyMode) {
      ownedIds = preOpenCollectionRef.current;
    }
    if (typeof duplicatePullWeight === 'number' && duplicatePullWeight > 0 && duplicatePullWeight < 1) {
      ownedIds = preOpenCollectionRef.current;
      ownedWeight = duplicatePullWeight;
    }
    const drawOptions = ownedIds ? { ownedIds, ownedWeight } : null;
    const drawn = forcedPack ?? (isPityPack ? openPityPack(cards, setId, drawOptions) : openPack(cards, setId, drawOptions));
    if (forcedPack) onPackUsed?.();
    // Update pity counter: hit = holo or any premium rarity in the drawn pack
    if (economyMode && !forcedPack) {
      const hasHit = drawn.some(
        (c) => c.holo === true || c.rarity === 'Rare BREAK' || c.rarity === 'Rare ex' || c.rarity === 'Rare LV.X' || c.rarity === 'Ultra Rare' || c.rarity === 'Rare Shiny' || c.rarity === 'Radiant Rare' || c.rarity === 'Secret Rare'
      );
      onPityUpdate?.(hasHit);
    }
    packCardsRef.current = drawn;
    if (setId) recordPackOpened(setId, drawn);
    setPackCards(drawn);
    setCurrentIndex(0);
    setCardState('facedown');
    setPhase('opening');
    openingTimerRef.current = setTimeout(() => setPhase('revealing'), 700);
  }, [cards, clearTimers, duplicatePullWeight, economyMode, forcedPack, onBuyPack, onPackUsed, onPityUpdate, onUseFreePack, pityCount, setId]);

  const handleSkipToSummary = useCallback(() => {
    clearTimers();
    onCardsAddedRef.current(packCardsRef.current);
    setPhase('summary');
  }, [clearTimers]);

  const currentCard    = packCards[currentIndex];
  const isSecretRare   = currentCard?.reverseHolo !== true && currentCard?.rarity === 'Secret Rare';
  const isHolo         = currentCard?.reverseHolo !== true && currentCard?.holo === true && !isSecretRare && currentCard?.setId !== 'dv1';
  const isNewCard      = currentCard != null && !preOpenCollectionRef.current.has(currentCard.id);
  const currentRarityLabel = currentCard?.gx === true && currentCard?.rarity === 'Rare ex'
    ? 'Rare GX'
    : currentCard?.vstar === true && currentCard?.rarity === 'Rare ex'
      ? 'Rare VSTAR'
      : currentCard?.vmax === true && currentCard?.rarity === 'Rare ex'
        ? 'Rare VMAX'
        : currentCard?.v === true && currentCard?.rarity === 'Rare ex'
          ? 'Rare V'
          : currentCard?.rarity;

  const handleCardClick = useCallback(() => {
    if (cardState === 'faceup') {
      clearTimeout(hideTimerRef.current);
      setCardState('hiding');
      return;
    }

    // Click during any buildup: skip straight to the flip
    if (cardState === 'holoReveal' || cardState === 'secretReveal') {
      clearTimeout(holoRevealTimerRef.current);
      setCardState('faceup');
      return;
    }

    if (cardState !== 'facedown') return;

    // Secret Rare gets the most dramatic buildup, then holo, then instant
    if (isSecretRare) {
      setCardState('secretReveal');
    } else if (isHolo) {
      setCardState('holoReveal');
    } else {
      setCardState('faceup');
    }
  }, [cardState, isHolo, isSecretRare]);

  const handleReset = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setPackCards([]);
    packCardsRef.current = [];
    setCurrentIndex(0);
    setCardState('facedown');
    setModalCard(null);
    setSoldIndices(new Set());
  }, [clearTimers]);

  const remaining      = packCards.length - currentIndex;
  const isHoloReveal   = cardState === 'holoReveal';
  const isSecretReveal = cardState === 'secretReveal';
  const isFlipped      = cardState === 'faceup' || cardState === 'hiding';
  const isHiding       = cardState === 'hiding';

  return (
    <div className="pack-opener">
      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <div className="pack-opener__idle">
          <h2 className="pack-opener__subtitle">{setName} Booster Pack</h2>
          <PackGraphic
            state="idle"
            setName={setName}
            onClick={economyMode
              ? (freePacks > 0 || coins >= packPrice ? () => handleOpenPack(freePacks > 0) : undefined)
              : handleOpenPack}
          />

          {economyMode ? (
            <>
              <button
                className={`btn-open${freePacks > 0 ? ' btn-open--free' : ''}${pityCount >= PITY_THRESHOLD ? ' btn-open--pity' : ''}`}
                onClick={() => handleOpenPack(freePacks > 0)}
                disabled={freePacks === 0 && coins < packPrice}
              >
                {freePacks > 0 ? (
                  <>
                    🎁 Open Free Pack
                    <span className="btn-open__badge">{freePacks} left</span>
                  </>
                ) : (
                  <>
                    Open Pack
                    <span className="btn-open__price">🪙 {packPrice.toLocaleString()}</span>
                  </>
                )}
              </button>
              {freePacks === 0 && coins < packPrice && (
                <p className="pack-cant-afford">
                  Need {(packPrice - coins).toLocaleString()} more coins
                </p>
              )}
              {canCoinFlip && (
                <button className="btn-coin-flip-idle" onClick={onCoinFlip}>
                  🪙 Flip a Coin for a Free Pack
                </button>
              )}
              {/* Pity meter */}
              <div className={`pity-meter${pityCount >= PITY_THRESHOLD ? ' pity-meter--ready' : ''}`}>
                <div className="pity-meter__pips">
                  {Array.from({ length: PITY_THRESHOLD }, (_, i) => (
                    <div key={i} className={`pity-pip${i < pityCount ? ' pity-pip--filled' : ''}`} />
                  ))}
                </div>
                {pityCount >= PITY_THRESHOLD ? (
                  <span className="pity-meter__label pity-meter__label--ready">✦ Holo Guaranteed!</span>
                ) : pityCount > 0 ? (
                  <span className="pity-meter__label">{pityCount}/{PITY_THRESHOLD} packs without a hit</span>
                ) : (
                  <span className="pity-meter__label">Pity meter — holo guaranteed at 10</span>
                )}
              </div>
            </>
          ) : (
            <button className="btn-open" onClick={handleOpenPack}>
              Open Pack
            </button>
            )}

            {/* Booster Box — economy only, not shown for BoosterDex packs */}
            {economyMode && onBuyBox && (
              <button
                className="btn-buy-box"
                onClick={onBuyBox}
                disabled={coins < packPrice * BOOSTER_BOX_MULTIPLIER}
              >
                📦 Buy Booster Box
                <span className="btn-buy-box__detail">
                  {BOOSTER_BOX_SIZE} packs · 🪙 {(packPrice * BOOSTER_BOX_MULTIPLIER).toLocaleString()}
                </span>
              </button>
            )}

          {onChangeSet && (
            <button className="btn-change-set" onClick={onChangeSet}>
              Change Set
            </button>
          )}
        </div>
      )}

      {/* ── OPENING – shake animation ── */}
      {phase === 'opening' && (
        <div className="pack-opener__idle">
          <PackGraphic state="shaking" setName={setName} />
        </div>
      )}

      {/* ── REVEALING – one card at a time ── */}
      {phase === 'revealing' && currentCard && (
        <div className="pack-opener__reveal">
          {/* Counter */}
          <div className="reveal-counter">
            <span className="reveal-counter__current">{currentIndex + 1}</span>
            <span className="reveal-counter__sep"> / </span>
            <span className="reveal-counter__total">{packCards.length}</span>
          </div>

          {/* Card stack */}
          <div className="card-stack-wrapper">
            {/* God rays burst for holo rare reveal */}
            {(isHolo || isSecretRare) && (isHoloReveal || isSecretReveal || isFlipped) && (
              <div className={`stack-holo-rays${isSecretRare ? ' stack-holo-rays--secret' : ''}`} />
            )}
            {/* Ghost layers for depth */}
            {remaining > 2 && <div className="stack-ghost stack-ghost--2"><img src={cardBackImg} alt="" draggable={false} /></div>}
            {remaining > 1 && <div className="stack-ghost stack-ghost--1"><img src={cardBackImg} alt="" draggable={false} /></div>}

            {/* Active card */}
            <div
              key={currentIndex}
              className={[
                'stack-flip',
                isFlipped      ? 'stack-flip--flipped'      : '',
                isHiding       ? 'stack-flip--hiding'        : '',
                isHoloReveal   ? 'stack-flip--holo-event'    : '',
                isSecretReveal ? 'stack-flip--secret-event'  : '',
                isHolo && isFlipped    ? 'stack-flip--holo'   : '',
                isSecretRare           ? 'stack-flip--secret' : '',
              ].join(' ')}
              onClick={handleCardClick}
              title={!isFlipped ? 'Click to reveal' : undefined}
            >
              {/* Card front */}
              <div className="stack-face stack-face--front">
                <img
                  src={getCardImageUrl(currentCard, 'high')}
                  alt={currentCard.name}
                  draggable="false"
                />
                {(isHolo || isSecretRare) && <div className="stack-holo" />}
                {isNewCard && isFlipped && <div className="new-badge">NEW</div>}
                <div className={`stack-rarity rarity--${currentCard.rarity.replace(/\s+/g, '-').toLowerCase()}`}>
                  {currentRarityLabel === 'Rare Holo'
                    ? '★ HOLO'
                    : currentRarityLabel === 'Rare'
                    ? '★ RARE'
                    : currentRarityLabel}
                </div>
              </div>
              {/* Card back */}
              <div className="stack-face stack-face--back">
                <CardBack />
              </div>
            </div>
          </div>

          {/* Info row beneath the card */}
          <div className="reveal-info">
            {isFlipped ? (
              <>
                <p className="reveal-name">{currentCard.name}</p>
                <p className={`reveal-rarity rarity--${currentCard.rarity.replace(/\s+/g, '-').toLowerCase()}`}>
                  {currentRarityLabel}
                </p>
              </>
            ) : (
              <p className={`reveal-prompt${isHoloReveal ? ' reveal-prompt--holo' : ''}${isSecretReveal ? ' reveal-prompt--secret' : ''}`}>
                {isSecretReveal
                  ? '✦ Secret Rare!!'
                  : isHoloReveal
                  ? '✦ Rare Holo!'
                  : remaining > 1
                  ? `Click to reveal · ${remaining} remaining`
                  : 'Click to reveal · Last card!'}
              </p>
            )}
          </div>

          <button className="btn-skip-summary" onClick={handleSkipToSummary}>
            Skip to summary
          </button>
        </div>
      )}

      {/* ── SUMMARY – 2×5 grid ── */}
      {phase === 'summary' && (
        <div className="pack-opener__summary">
          <h2 className="summary-title">Pack Results</h2>

          <div className="summary-grid">
            {packCards.map((card, i) => {
              const isDupe   = preOpenCollectionRef.current.has(card.id);
              const isSold   = soldIndices.has(i);
              const sellAmt  = getCardSellPrice?.(card) ?? 0;
              return (
                <div
                  key={card.id + i}
                  className={`summary-card${isSold ? ' summary-card--sold' : ''}`}
                  style={{ animationDelay: `${i * 55}ms` }}
                  onClick={() => !isSold && setModalCard(card)}
                >
                  <div className="summary-card__inner">
                    <PokemonCard card={card} size="normal" />
                    {!isDupe && !isSold && (
                      <div className="new-badge new-badge--summary">NEW</div>
                    )}
                    {isSold && (
                      <div className="sold-badge">SOLD</div>
                    )}
                    {economyMode && isDupe && !isSold && (
                      <button
                        className="btn-sell-card"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSoldIndices((prev) => new Set([...prev, i]));
                          onSellCard?.(card);
                        }}
                      >
                        🪙 {sellAmt.toLocaleString()}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="summary-actions">
            {economyMode && (() => {
              const unsold = packCards
                .map((card, i) => ({ card, i }))
                .filter(({ card, i }) => preOpenCollectionRef.current.has(card.id) && !soldIndices.has(i));
              const earned = [...soldIndices]
                .reduce((sum, idx) => sum + (getCardSellPrice?.(packCards[idx]) ?? 0), 0);
              return (
                <>
                  {earned > 0 && (
                    <p className="summary-earned">🪙 +{earned.toLocaleString()} coins from sales</p>
                  )}
                  {unsold.length >= 2 && (
                    <button
                      className="btn-sell-all"
                      onClick={() => {
                        const next = new Set(soldIndices);
                        for (const { card, i } of unsold) { next.add(i); onSellCard?.(card); }
                        setSoldIndices(next);
                      }}
                    >
                      Sell All Duplicates ({unsold.length})
                    </button>
                  )}
                </>
              );
            })()}
            <span className="summary-added">✓ Added to collection</span>
            <button className="btn-open" onClick={handleReset}>
              Open Another Pack
            </button>
            {onChangeSet && (
              <button className="btn-change-set" onClick={onChangeSet}>
                Change Set
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Full-screen card modal ── */}
      {modalCard && (
        <CardModal card={modalCard} onClose={() => setModalCard(null)} />
      )}

    </div>
  );
}
