import { useRef, useEffect, useState, useCallback } from 'react';
import { getCardImageUrl } from '../services/tcgdex.js';
import { isFavourited, toggleFavourite, toFavouriteKey } from '../services/favourites.js';
import { rollGrade } from '../services/grading.js';
import { getGradeMultiplier } from '../services/grading.js';
import { SETS } from '../services/sets.js';
import './CardModal.css';
import cardBackImg from '../assets/back_of_card.webp';

const RARITY_COLOR = {
  'Common':    '#9ca3af',
  'Uncommon':  '#4ade80',
  'Rare':      '#60a5fa',
  'Ultra Rare': '#fb7185',
  'Rare ex':   '#f97316',
  'Rare GX':   '#22d3ee',
  'Rare V':    '#34d399',
  'Rare VMAX': '#a78bfa',
  'Rare VSTAR': '#facc15',
  'Rare LV.X': '#38bdf8',
  'Rare Shiny': '#facc15',
  'Rare Holo': '#e879f9',
};

const TILT_MAX = 34;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function CardModal({ card, onClose, onFavouriteChange, onGradeCard }) {
  const imageWrapRef = useRef(null);
  const slabRevealTimerRef = useRef(null);
  const backViewOnTimerRef = useRef(null);
  const backViewOffTimerRef = useRef(null);
  const favKey = toFavouriteKey(card?.baseCardId ?? card?.id);
  const [favourited, setFavourited] = useState(() => card ? isFavourited(favKey) : false);
  const [gradingState, setGradingState] = useState('idle'); // idle | animating | done
  const [revealedGrade, setRevealedGrade] = useState(() => (typeof card?.grade === 'number' ? card.grade : null));
  const [gradingIntensity, setGradingIntensity] = useState(0);
  const [gradingDuration, setGradingDuration] = useState(1600);
  const [slabRevealReady, setSlabRevealReady] = useState(false);
  const [isBackView, setIsBackView] = useState(false);
  // Track whether gyroscope is actively driving tilt so touch can act as fallback
  const gyroActiveRef = useRef(false);

  useEffect(() => {
    setRevealedGrade(typeof card?.grade === 'number' ? card.grade : null);
    setGradingState('idle');
    setGradingIntensity(0);
    setGradingDuration(1600);
    setSlabRevealReady(false);
    setIsBackView(false);
    clearTimeout(slabRevealTimerRef.current);
    clearTimeout(backViewOnTimerRef.current);
    clearTimeout(backViewOffTimerRef.current);
    setFavourited(card ? isFavourited(toFavouriteKey(card.baseCardId ?? card.id)) : false);
  }, [card?.id]);

  useEffect(() => () => {
    clearTimeout(slabRevealTimerRef.current);
    clearTimeout(backViewOnTimerRef.current);
    clearTimeout(backViewOffTimerRef.current);
  }, []);

  const handleFavourite = useCallback(() => {
    const nowFav = toggleFavourite(card.baseCardId ?? card.id);
    setFavourited(nowFav);
    onFavouriteChange?.();
  }, [card, onFavouriteChange]);

  const applyTilt = (rx, ry) => {
    const el = imageWrapRef.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', `${clamp(rx, -TILT_MAX, TILT_MAX)}deg`);
    el.style.setProperty('--tilt-y', `${clamp(ry, -TILT_MAX, TILT_MAX)}deg`);
  };

  const resetTilt = () => {
    const el = imageWrapRef.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };

  // ── Gyroscope ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof DeviceOrientationEvent === 'undefined') return;    if (localStorage.getItem('pkmon_gyro_disabled') === 'true') return;
    const handleOrientation = (e) => {
      if (e.gamma === null) return; // no real data
      gyroActiveRef.current = true;
      // Clamp beta to [0, 180] BEFORE computing to prevent the sudden ±180° wrap-around
      // that causes the card to flip instead of tilt smoothly.
      // Centre at 75° — the natural phone-holding angle — so the card sits flat at rest.
      const beta = clamp(e.beta ?? 75, 0, 180);
      const rx = clamp(-((beta - 75) * 0.4), -TILT_MAX, TILT_MAX);
      // Reduce gamma sensitivity slightly so side-tilts feel proportional.
      const ry = clamp((e.gamma ?? 0) * 0.6, -TILT_MAX, TILT_MAX);
      applyTilt(rx, ry);
    };

    const register = () =>
      window.addEventListener('deviceorientation', handleOrientation, { passive: true });

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+: permission must be requested from a user gesture.
      // Piggyback on the next touchstart (the user is already interacting with the modal).
      const onGesture = () => {
        DeviceOrientationEvent.requestPermission()
          .then((state) => { if (state === 'granted') register(); })
          .catch(() => {});
      };
      document.addEventListener('touchstart', onGesture, { once: true });
      return () => {
        document.removeEventListener('touchstart', onGesture);
        window.removeEventListener('deviceorientation', handleOrientation);
      };
    } else {
      register();
      return () => window.removeEventListener('deviceorientation', handleOrientation);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card) return null;

  const imageUrl = getCardImageUrl(card, 'high');
  const isHolo = card.holo === true;
  const isReverseHolo = card.reverseHolo === true;
  const isLcReverse = card.setId === 'lc' && card.reverseHolo === true;
  const rarityLabel = card.gx === true && card.rarity === 'Rare ex'
    ? 'Rare GX'
    : card.vstar === true && card.rarity === 'Rare ex'
      ? 'Rare VSTAR'
      : card.vmax === true && card.rarity === 'Rare ex'
        ? 'Rare VMAX'
        : card.v === true && card.rarity === 'Rare ex'
          ? 'Rare V'
          : card.rarity;
  const rarityColor = RARITY_COLOR[rarityLabel] ?? RARITY_COLOR[card.rarity] ?? '#9ca3af';
  const setName = card.setName ?? card.set?.name ?? SETS.find((s) => s.id === (card.setId ?? 'base1'))?.name ?? 'Unknown Set';
  const grade = typeof card.grade === 'number' ? card.grade : revealedGrade;
  const isGraded = typeof grade === 'number';
  const gradeMultiplier = getGradeMultiplier(grade);
  const gradeBonusPct = Math.round((gradeMultiplier - 1) * 100);
  const showGradedFrame = isGraded && (gradingState !== 'animating' || slabRevealReady);
  const gradedCopies = card?.graded
    ? Object.values(card.graded).reduce((sum, qty) => sum + (Number(qty) || 0), 0)
    : (typeof card?.grade === 'number' ? (card.count ?? 1) : 0);
  const ungradedCopies = Math.max(0, (card.count ?? 1) - gradedCopies);
  const canSubmitGrade = !isGraded && gradingState !== 'animating' && !!onGradeCard;

  const handleSubmitToGrading = async () => {
    if (!onGradeCard || isGraded || gradingState === 'animating') return;
    const rolled = rollGrade(card);

    setRevealedGrade(rolled);
    const intensity = Math.max(0, rolled - 5);
    const duration = 2200 + intensity * 320;
    setGradingIntensity(intensity);
    setGradingDuration(duration);
    setSlabRevealReady(false);
    setIsBackView(false);
    setGradingState('animating');
    backViewOnTimerRef.current = setTimeout(() => {
      setIsBackView(true);
    }, Math.floor(duration * 0.16));
    backViewOffTimerRef.current = setTimeout(() => {
      setIsBackView(false);
    }, Math.floor(duration * 0.88));
    // Apply slab while card is still facing away, then flip it back at the end.
    slabRevealTimerRef.current = setTimeout(() => {
      setSlabRevealReady(true);
    }, Math.floor(duration * 0.68));
    await new Promise((resolve) => setTimeout(resolve, duration));
    await Promise.resolve(onGradeCard(card, rolled));
    setGradingState('done');
    setIsBackView(false);
  };

  // ── Mouse tilt (desktop) ─────────────────────────────────────────────────
  const handleMouseMove = (e) => {
    const x = e.clientX / (window.innerWidth  || 1);
    const y = e.clientY / (window.innerHeight || 1);
    applyTilt((0.5 - y) * TILT_MAX, (x - 0.5) * TILT_MAX);
  };

  // ── Touch tilt (mobile fallback when gyroscope unavailable) ─────────────
  const handleTouchMove = (e) => {
    if (gyroActiveRef.current) return; // gyro is driving — don't override
    const t = e.touches[0];
    if (!t) return;
    const x = t.clientX / (window.innerWidth  || 1);
    const y = t.clientY / (window.innerHeight || 1);
    // Use 2.5× multiplier so a natural short finger drag reaches full tilt on
    // the smaller screen real-estate of a phone.
    applyTilt((0.5 - y) * TILT_MAX * 2.5, (x - 0.5) * TILT_MAX * 2.5);
  };

  return (
    <div
      className="card-modal-backdrop"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseLeave={resetTilt}
      onTouchMove={handleTouchMove}
      onTouchEnd={resetTilt}
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
    >
      <div
        className="card-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="card-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <button
          className={`card-modal-fav${favourited ? ' card-modal-fav--on' : ''}`}
          onClick={handleFavourite}
          aria-label={favourited ? 'Remove from favourites' : 'Add to favourites'}
          title={favourited ? 'Remove from favourites' : 'Add to favourites'}
        >
          {favourited ? '♥' : '♡'}
        </button>

        <div
          ref={imageWrapRef}
          className={`card-modal-image-wrap${(isHolo || isReverseHolo) && !isLcReverse ? ' card-modal-image-wrap--holo' : ''}${isLcReverse ? ' card-modal-image-wrap--lc-reverse' : ''}${showGradedFrame ? ' card-modal-image-wrap--graded' : ''}${gradingState === 'animating' ? ' card-modal-image-wrap--grading' : ''}`}
          style={gradingState === 'animating' ? {
            '--grade-intensity': gradingIntensity,
            '--grading-duration': `${gradingDuration}ms`,
          } : undefined}
        >
          <div className={`card-modal-flip${isBackView ? ' card-modal-flip--backview' : ''}`}>
            <div className="card-modal-face card-modal-face--front">
              {showGradedFrame && !isBackView && <div className="card-modal-grade-tag">GRADE {grade}</div>}
              <img
                src={isBackView ? cardBackImg : imageUrl}
                alt={isBackView ? 'Card back' : card.name}
                className={isBackView ? 'card-modal-cardback' : 'card-modal-image'}
                draggable="false"
              />
              {(isHolo || isReverseHolo) && !isBackView && !isLcReverse && <div className="card-modal-holo" />}
              {isLcReverse && !isBackView && <div className="card-modal-lc-reverse" />}
            </div>
            <div className="card-modal-face card-modal-face--back">
              {showGradedFrame && <div className="card-modal-grade-tag-back" aria-hidden="true" />}
              <img src={cardBackImg} alt="Card back" className="card-modal-cardback" draggable="false" />
            </div>
          </div>
          {gradingState === 'animating' && (
            <>
              <div className="card-modal-grade-flash" />
              <div className="card-modal-grade-shake-lines" />
            </>
          )}
        </div>

        <div className="card-modal-meta">
          <h2 className="card-modal-name">{card.name}</h2>
          <span className="card-modal-rarity" style={{ color: rarityColor }}>
            {rarityLabel}{isHolo && <span style={{ color: '#c084fc' }}> ✦ Holo</span>}{isReverseHolo && <span style={{ color: '#22d3ee' }}> ✦ Reverse Holo</span>}
          </span>
          <span className="card-modal-set">{setName} · #{card.localId ?? '?'}</span>

          <div className="card-modal-grading">
            {canSubmitGrade && (
              <button className="card-modal-grade-btn" onClick={handleSubmitToGrading} disabled={ungradedCopies <= 0}>
                {ungradedCopies <= 0 ? 'All Copies Graded' : 'Submit To Grading'}
              </button>
            )}

            {gradingState === 'animating' && !showGradedFrame && (
              <div className="card-modal-grading-anim" aria-live="polite">
                <div className="card-modal-grading-scan" />
                <span>
                  {gradingIntensity >= 4
                    ? 'Ultra-clean slab check... almost there.'
                    : gradingIntensity >= 2
                      ? 'Centering and surface scoring...'
                      : 'Authenticating and inspecting...'}
                </span>
              </div>
            )}

            {showGradedFrame && (
              <div className="card-modal-grade-info">
                <strong>Certified Grade: {grade}</strong>
                <span>
                  {gradeBonusPct > 0 ? `Sell value bonus: +${gradeBonusPct}%` : 'No sell bonus at grades 1-5'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

