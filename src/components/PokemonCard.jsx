import { getCardImageUrl } from '../services/tcgdex.js';
import './PokemonCard.css';

const RARITY_LABEL = {
  'Common':      { label: '●',   color: '#9ca3af' },
  'Uncommon':    { label: '◆',   color: '#4ade80' },
  'Rare':        { label: '★',   color: '#60a5fa' },
  'Rare BREAK':  { label: 'BREAK', color: '#f59e0b' },
  'Ultra Rare':  { label: 'UR',  color: '#fb7185' },
  'Rare ex':     { label: 'EX',  color: '#f97316' },
  'Rare LV.X':    { label: 'LV.X',  color: '#38bdf8' },
  'Rare Shiny':   { label: 'SH',    color: '#facc15' },
  'Radiant Rare': { label: '✺',     color: '#f59e0b' },
  'Secret Rare': { label: '★★',  color: '#fbbf24' },
};
const HOLO_SUFFIX    = { label: ' ✦', color: '#c084fc' };
const REVERSE_SUFFIX = { label: ' ✦', color: '#22d3ee' };
const MEGA_SUFFIX    = { label: 'MEGA', color: '#facc15' };
const GX_LABEL       = { label: 'GX', color: '#22d3ee' };
const V_LABEL        = { label: 'V', color: '#34d399' };
const VMAX_LABEL     = { label: 'VMAX', color: '#a78bfa' };
const VSTAR_LABEL    = { label: 'VSTAR', color: '#facc15' };

export default function PokemonCard({ card, size = 'normal', showCount = false, onClick, unowned = false, secretUnowned = false, showGraded = false }) {
  // Secret rare not yet found – render a fully blacked-out mystery card
  if (secretUnowned) {
    return (
      <div
        className={`pcard size-${size} pcard--secret-unowned`}
        style={{ aspectRatio: '2.5 / 3.5' }}
      >
        <span className="pcard__mystery-q">?</span>
      </div>
    );
  }

  const imageUrl = getCardImageUrl(card, 'high');
  const isHolo = card.holo === true;
  const isReverseHolo = card.reverseHolo === true;
  const isLcReverse = card.setId === 'lc' && card.reverseHolo === true;
  const isSecretRare = card.rarity === 'Secret Rare';
  const hasGrade = typeof card.grade === 'number';
  const isGraded = hasGrade && showGraded;
  const base = RARITY_LABEL[card.rarity] ?? RARITY_LABEL['Common'];
  const isMegaEx = card.megaEx === true && card.rarity === 'Rare ex';
  const isGx = card.gx === true && card.rarity === 'Rare ex';
  const isVstar = card.vstar === true && card.rarity === 'Rare ex';
  const isVmax = card.vmax === true && card.rarity === 'Rare ex';
  const isV = card.v === true && card.rarity === 'Rare ex';

  return (
    <div
      className={`pcard size-${size}${(isHolo || isReverseHolo) && !isLcReverse ? ' pcard--holo' : ''}${isLcReverse ? ' pcard--lc-reverse' : ''}${isSecretRare ? ' pcard--secret-rare' : ''}${isGraded ? ' pcard--graded' : ''}${onClick ? ' pcard--clickable' : ''}${unowned ? ' pcard--unowned' : ''}`}
      onClick={onClick ? () => onClick(card) : undefined}
    >
      {isGraded && <div className="pcard__grade-tag">GRADE {card.grade}</div>}
      <img
        className="pcard__img"
        src={imageUrl}
        alt={card.name}
        loading="lazy"
        draggable="false"
      />
      {(isHolo || isReverseHolo) && !isLcReverse && !unowned && <div className="pcard__holo-overlay" />}
      {isLcReverse && !unowned && <div className="pcard__lc-reverse-overlay" />}
      <div className="pcard__rarity">
        {isMegaEx && <span style={{ color: MEGA_SUFFIX.color }}>{MEGA_SUFFIX.label} </span>}
        {isVstar
          ? <span style={{ color: VSTAR_LABEL.color }}>{VSTAR_LABEL.label}</span>
          : isVmax
            ? <span style={{ color: VMAX_LABEL.color }}>{VMAX_LABEL.label}</span>
            : isV
              ? <span style={{ color: V_LABEL.color }}>{V_LABEL.label}</span>
              : isGx
                ? <span style={{ color: GX_LABEL.color }}>{GX_LABEL.label}</span>
                : <span style={{ color: base.color }}>{base.label}</span>}
        {isHolo && card.rarity !== 'Rare ex' && card.rarity !== 'Rare BREAK' && card.rarity !== 'Rare LV.X' && card.rarity !== 'Rare Shiny' && card.rarity !== 'Radiant Rare' && card.rarity !== 'Ultra Rare' && <span style={{ color: HOLO_SUFFIX.color }}>{HOLO_SUFFIX.label}</span>}
        {isReverseHolo && card.rarity !== 'Rare ex' && card.rarity !== 'Rare BREAK' && card.rarity !== 'Rare LV.X' && card.rarity !== 'Rare Shiny' && card.rarity !== 'Radiant Rare' && card.rarity !== 'Ultra Rare' && <span style={{ color: REVERSE_SUFFIX.color }}>{REVERSE_SUFFIX.label}</span>}
      </div>
      {showCount && card.count > 1 && (
        <div className="pcard__count">×{card.count}</div>
      )}
    </div>
  );
}
