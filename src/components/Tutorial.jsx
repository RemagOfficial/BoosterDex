import { useState, useRef } from 'react';
import './Tutorial.css';
import {
  SANDBOX_DIFFICULTIES,
  ECONOMY_DIFFICULTIES,
  DEFAULT_DIFFICULTY_BY_MODE,
} from '../services/difficulty.js';

// ── Preview sub-components ─────────────────────────────────────────────────

function WelcomePreview() {
  const rotations = ['-24deg', '-12deg', '0deg', '12deg', '24deg'];
  return (
    <div className="tut-preview tut-preview--welcome">
      <div className="tut-wlc-fan">
        {rotations.map((rot, i) => (
          <div key={i} className="tut-wlc-card" style={{ '--rot': rot, '--i': i }}>
            ◆
          </div>
        ))}
      </div>
      <div className="tut-wlc-logo">
        <span className="tut-wlc-diamond">◆</span>
        <span className="tut-wlc-name">Booster<b>Dex</b></span>
      </div>
    </div>
  );
}

function SetPreview() {
  const sets = [
    { name: 'Base Set',           year: '1999', hue: 0   },
    { name: 'Jungle',             year: '1999', hue: 140 },
    { name: 'Fossil',             year: '1999', hue: 220 },
    { name: 'Team Rocket',        year: '2000', hue: 270 },
    { name: 'Neo Genesis',        year: '2000', hue: 200 },
    { name: 'EX Ruby & Sapphire', year: '2003', hue: 330 },
  ];
  return (
    <div className="tut-preview tut-preview--sets">
      {sets.map((s, i) => (
        <div
          key={i}
          className={`tut-set-item${i === 0 ? ' tut-set-item--selected' : ''}`}
          style={{ '--hue': s.hue }}
        >
          <div className="tut-set-item__band" />
          <div className="tut-set-item__name">{s.name}</div>
          <div className="tut-set-item__year">{s.year}</div>
        </div>
      ))}
    </div>
  );
}

function PackPreview() {
  return (
    <div className="tut-preview tut-preview--pack">
      <div className="tut-pack-cards">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="tut-flip" style={{ '--delay': `${i * 0.55}s` }}>
            <div className="tut-flip__inner">
              <div className="tut-flip__back">◆</div>
              <div className={`tut-flip__front${i === 4 ? ' tut-flip__front--holo' : ''}`} />
            </div>
          </div>
        ))}
      </div>
      <p className="tut-pack-label">5 cards per pack · click each card to reveal it</p>
    </div>
  );
}

function CollectionPreview() {
  const chips = ['All', 'Common', 'Uncommon', 'Rare', 'Holo'];
  const cards = [
    'holo', 'common', 'rare',
    'common', 'uncommon', 'holo',
    'rare', 'common', 'uncommon',
    'holo', 'uncommon', 'rare',
  ];
  return (
    <div className="tut-preview tut-preview--collection">
      <div className="tut-chips">
        {chips.map((c, i) => (
          <span key={i} className={`tut-chip${i === 0 ? ' tut-chip--active' : ''}`}>{c}</span>
        ))}
        <span className="tut-chip tut-chip--search">🔍 Search…</span>
      </div>
      <div className="tut-col-grid">
        {cards.map((r, i) => (
          <div key={i} className={`tut-col-card tut-col-card--${r}`} />
        ))}
      </div>
    </div>
  );
}

function AchievementsPreview() {
  const achs = [
    { icon: '○', label: 'Common Ground', pct: 80, color: '#94a3b8' },
    { icon: '◇', label: 'Uncommon Find', pct: 55, color: '#10b981' },
    { icon: '★', label: 'Rare Treasure', pct: 33, color: '#f59e0b' },
    { icon: '✦', label: 'Holo Hunter',   pct: 14, color: '#a855f7' },
  ];
  return (
    <div className="tut-preview tut-preview--achievements">
      {achs.map((a, i) => (
        <div key={i} className="tut-ach-row" style={{ '--delay': `${0.1 + i * 0.15}s` }}>
          <span className="tut-ach-icon" style={{ color: a.color }}>{a.icon}</span>
          <div className="tut-ach-body">
            <div className="tut-ach-label">
              <span>{a.label}</span>
              {i < 2 && <span className="tut-ach-badge">🎁 Free packs</span>}
            </div>
            <div className="tut-ach-track">
              <div
                className="tut-ach-bar"
                style={{ '--pct': `${a.pct}%`, '--clr': a.color, '--delay': `${0.1 + i * 0.15}s` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ModePickPreview() {
  return (
    <div className="tut-preview tut-preview--mode">
      <div className="tut-mode-panel tut-mode-panel--sandbox">
        <div className="tut-mode-panel__icon">∞</div>
        <div className="tut-mode-panel__name">Sandbox</div>
        <div className="tut-mode-panel__sub">Open freely</div>
      </div>
      <div className="tut-mode-divider">vs</div>
      <div className="tut-mode-panel tut-mode-panel--economy">
        <div className="tut-mode-panel__icon">◆</div>
        <div className="tut-mode-panel__name">Economy</div>
        <div className="tut-mode-panel__sub">Earn &amp; spend</div>
      </div>
    </div>
  );
}

function ModeContent({
  selectedMode,
  setSelectedMode,
  selectedSandboxDifficulty,
  setSelectedSandboxDifficulty,
  selectedEconomyDifficulty,
  setSelectedEconomyDifficulty,
}) {
  const activeDifficultyId = selectedMode === 'economy' ? selectedEconomyDifficulty : selectedSandboxDifficulty;
  const activeDifficulties = selectedMode === 'economy'
    ? Object.values(ECONOMY_DIFFICULTIES)
    : Object.values(SANDBOX_DIFFICULTIES);

  return (
    <div className="tut-mode-picker">
      <button
        type="button"
        className={`tut-mode-opt${selectedMode === 'sandbox' ? ' tut-mode-opt--active' : ''}`}
        onClick={() => setSelectedMode('sandbox')}
      >
        <span className="tut-mode-opt__icon">∞</span>
        <div className="tut-mode-opt__text">
          <strong className="tut-mode-opt__name">Sandbox</strong>
          <span className="tut-mode-opt__desc">Unlimited packs, no restrictions. Great for exploring every set.</span>
        </div>
        <span className="tut-mode-opt__check" aria-hidden="true">✓</span>
      </button>
      <button
        type="button"
        className={`tut-mode-opt${selectedMode === 'economy' ? ' tut-mode-opt--active' : ''}`}
        onClick={() => setSelectedMode('economy')}
      >
        <span className="tut-mode-opt__icon tut-mode-opt__icon--economy">◆</span>
        <div className="tut-mode-opt__text">
          <strong className="tut-mode-opt__name">Economy</strong>
          <span className="tut-mode-opt__desc">Earn coins, buy packs, and get achievement rewards. Budget your pulls.</span>
          <span className="tut-mode-beta">⚠ Beta — may have bugs</span>
        </div>
        <span className="tut-mode-opt__check" aria-hidden="true">✓</span>
      </button>
      <div className="tut-mode-difficulty">
        <span className="tut-mode-difficulty__title">Difficulty</span>
        <div className="tut-mode-difficulty__options">
          {activeDifficulties.map((difficulty) => (
            <button
              key={difficulty.id}
              type="button"
              className={`tut-mode-difficulty__option${activeDifficultyId === difficulty.id ? ' tut-mode-difficulty__option--active' : ''}`}
              onClick={() => {
                if (selectedMode === 'economy') setSelectedEconomyDifficulty(difficulty.id);
                else setSelectedSandboxDifficulty(difficulty.id);
              }}
            >
              <span className="tut-mode-difficulty__name">{difficulty.label}</span>
              <span className="tut-mode-difficulty__desc">{difficulty.description}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="tut-mode-note">You can switch modes any time from the settings menu.</p>
    </div>
  );
}

// ── Slide definitions ──────────────────────────────────────────────────────

const SLIDES = [
  {
    id: 'welcome',
    title: 'Welcome to BoosterDex',
    body: 'Your digital Pokémon TCG pack opener. Rip open classic booster sets, build your collection, and chase those holographic rares.',
    Preview: WelcomePreview,
  },
  {
    id: 'sets',
    title: 'Pick a Set',
    body: 'Choose from dozens of sets — from the 1999 Base Set through the EX series. Each has its own unique card pool, pull rates, and art.',
    Preview: SetPreview,
  },
  {
    id: 'packs',
    title: 'Open Packs',
    body: 'Each pack contains 5 cards. Click any face-down card to flip and reveal it. Holo and Secret Rare cards get special animated reveals.',
    Preview: PackPreview,
  },
  {
    id: 'collection',
    title: 'Your Collection',
    body: 'Every card you pull is saved here. Filter by rarity, search by name, favourite your best pulls, and build Showcases to show off.',
    Preview: CollectionPreview,
  },
  {
    id: 'achievements',
    title: 'Earn Achievements',
    body: 'Collect every card of a rarity tier to unlock an achievement. Switch to Economy mode to earn free packs as rewards for each one.',
    Preview: AchievementsPreview,
  },
  {
    id: 'mode',
    title: 'Choose Your Mode',
    Preview: ModePickPreview,
    Content: ModeContent,
  },
];

// ── Main component ─────────────────────────────────────────────────────────

export default function Tutorial({ onDone }) {
  const [slide, setSlide] = useState(0);
  const [selectedMode, setSelectedMode] = useState('sandbox');
  const [selectedSandboxDifficulty, setSelectedSandboxDifficulty] = useState(DEFAULT_DIFFICULTY_BY_MODE.sandbox);
  const [selectedEconomyDifficulty, setSelectedEconomyDifficulty] = useState(DEFAULT_DIFFICULTY_BY_MODE.economy);
  const dirRef = useRef(1);

  const go = (newIdx) => {
    if (newIdx === slide) return;
    dirRef.current = newIdx > slide ? 1 : -1;
    setSlide(newIdx);
  };

  const next = () => {
    const selectedDifficulty = selectedMode === 'economy' ? selectedEconomyDifficulty : selectedSandboxDifficulty;
    if (slide < SLIDES.length - 1) go(slide + 1);
    else onDone(selectedMode, selectedDifficulty);
  };

  const prev = () => {
    if (slide > 0) go(slide - 1);
  };

  const { Preview, title, body, Content } = SLIDES[slide];

  return (
    <div className="tut-overlay">
      <div className="tut-modal">
        <button className="tut-skip" onClick={() => onDone(selectedMode, selectedMode === 'economy' ? selectedEconomyDifficulty : selectedSandboxDifficulty)}>Skip</button>

        <div
          key={slide}
          className={`tut-slide tut-slide--${dirRef.current > 0 ? 'fwd' : 'bck'}`}
        >
          <div className="tut-preview-wrap">
            <Preview />
          </div>
          <div className="tut-text">
            <h2 className="tut-title">{title}</h2>
            {Content
              ? (
                <Content
                  selectedMode={selectedMode}
                  setSelectedMode={setSelectedMode}
                  selectedSandboxDifficulty={selectedSandboxDifficulty}
                  setSelectedSandboxDifficulty={setSelectedSandboxDifficulty}
                  selectedEconomyDifficulty={selectedEconomyDifficulty}
                  setSelectedEconomyDifficulty={setSelectedEconomyDifficulty}
                />
              )
              : <p className="tut-body">{body}</p>
            }
          </div>
        </div>

        <div className="tut-nav">
          <button
            className="tut-nav-btn tut-nav-btn--ghost"
            onClick={prev}
            disabled={slide === 0}
          >
            ← Back
          </button>
          <div className="tut-dots">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                className={`tut-dot${i === slide ? ' tut-dot--active' : ''}`}
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
          <button className="tut-nav-btn tut-nav-btn--primary" onClick={next}>
            {slide === SLIDES.length - 1 ? 'Get Started ◆' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
