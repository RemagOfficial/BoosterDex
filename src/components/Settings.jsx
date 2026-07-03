import { useRef, useState } from 'react';
import './Settings.css';
import {
  SANDBOX_DIFFICULTIES,
  ECONOMY_DIFFICULTIES,
  getEconomyDifficultyChangeCost,
} from '../services/difficulty.js';

const CHANGELOG = [
  {
    version: '1.17.1',
    date: '2026-07-03',
    entries: [
      'Fixed: Legendary Collection achievements now match modern set conventions of separating unique card numbers and variants'
    ],
  },
  {
    version: '1.17.0',
    date: '2026-06-29',
    entries: [
      'Number formatting — all card counts (set totals, collection stats, achievement progress) now display with commas for better readability',
      'Hide complete sets filter — now correctly includes secret rare cards in the completion check, while still not requiring all variants',
      'Legendary Collection reverse cards — now appear as the last card in packs (after the rare slot) with a unique golden holo effect in both normal and fullscreen views',
      'Started fixing inaccuracies in special set packs (packs up to Generations have been updated)',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-06-18',
    entries: [
      'Fixed incorrect achievement goals',
      'Added difficulty settings per mode: Sandbox (Standard/Collector) and Economy (Cheaper/Regular/Hard), including paid switches when moving to easier Economy difficulties',
    ],
  },
  {
    version: '1.15.5',
    date: '2026-06-14',
    entries: [
      'Fixed achievement issues',
    ],
  },
  {
    version: '1.15.4',
    date: '2026-06-14',
    entries: [
      'Added secure save export/import with encrypted, checksummed save files and mode-aware imports for Sandbox and Economy saves',
    ],
  },
  {
    version: '1.15.3',
    date: '2026-06-13',
    entries: [
      'Fixed: achievement completion claims are now persisted more reliably, preventing missing completed achievements on existing saves',
      'Added: Recheck Achievements button in Settings to scan all sets and restore any completed achievements that were not marked correctly',
      'Fixed: set completion modal now respects saved completion state and no longer reappears after refreshing the page',
      'Added: Hide completed sets filter is now available on Open Packs and Achievements set lists (matching Collection)',
    ],
  },
  {
    version: '1.15.2',
    date: '2026-06-12',
    entries: [
      'Fixed: achievements are no longer checked for completion on page load; completion toasts now only trigger during active gameplay',
    ],
  },
  {
    version: '1.15.1',
    date: '2026-06-07',
    entries: [
      'Fixed: achievement toasts no longer fire on page load for achievements already completed in a previous session',
      'Gym Heroes achievements corrected — now has separate Rare and Rare Holo tiers with accurate card counts',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-06-06',
    entries: [
      'Economy mode free packs now lean harder toward cards you do not already own',
      'Booster boxes added for economy mode — buy 36 packs at a better rate than singles and open them whenever you want',
    ],
  },
  {
    version: '1.14.1',
    date: '2026-06-06',
    entries: [
      'Fixed: achievement completion and stats now persist correctly between sessions — progress no longer resets to zero on page reload',
      'Pack graphic is now clickable to open a pack, in addition to the Open Pack button',
      'Fixed: gyroscope tilt no longer flips the card when the phone reaches the rotation boundary',
      'Card tilt now starts flat by default on mobile instead of pre-tilted',
      'Touch drag tilt sensitivity increased for better feel on smaller screens',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-06-04',
    entries: [
      'Mega Evolution expansion added — Chaos Rising (me04)',
      'All special expansions have been added across XY, Sun & Moon, Sword & Shield, Scarlet & Violet, and Mega Evolution',
    ],
  },
  {
    version: '1.13.1',
    date: '2026-05-22',
    entries: [
      'Mobile experience improved',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-05-22',
    entries: [
      "Added Global Achievements for collecting every card and every holo variant, with generous rewards to celebrate completion",
      "Added BoosterDex Mega Booster, a special pack containing every card currently loaded, the pack can be unlocked in economy mode by opening every set at least once",
    ],
  },
  {
    version: '1.12.1',
    date: '2026-05-22',
    entries: [
      'Rare family labeling polish — GX, V, VMAX, and VSTAR names/colors are now consistent in pack reveals and fullscreen view',
      'Pack reveal animation polish — premium hit animations now trigger regardless of card position in a pack, while reverse holo cards no longer use premium animations',
      'Filter persistence improvements — set/search/filter selections now persist reliably across Open Packs, Collection, and Achievements screens',
      'UI layout polish — active filter chips and Clear all now appear below the search bar for cleaner set filtering',
      'Modern pack pulls have been rebalanced',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-05-21',
    entries: [
      'Full Sun & Moon series added — Sun & Moon through Cosmic Eclipse (sm1–sm12)',
      'Full Sword & Shield series added — Sword & Shield through Silver Tempest (swsh1–swsh12)',
      'Full Scarlet & Violet series added — Scarlet & Violet through Destined Rivals (sv01–sv10)',
      'Full Mega Evolution series added — Mega Evolution through Chaos Rising (me01–me04)',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-05-21',
    entries: [
      'Full Black & White and XY series added — BW through Legendary Treasures (bw1–bw11) and XY through Evolutions (xy1–xy12)',
      'Collection filter polish — filter order is now clearer (tags first, then rarity from rarest to common), and active filter counts now display correctly',
      'Graded collection fixes — Graded tab count now updates properly, and graded holo overlays in normal card view are aligned to card art',
      'Mobile fullscreen card fix — card modal sizing on phones now scales correctly so cards no longer appear undersized'
    ],
  },
  {
    version: '1.10.0',
    date: '2026-05-20',
    entries: [
      'Full Platinum series added — Platinum through Arceus (pl1–pl4)',
      'Full HeartGold & SoulSilver series added — HS Unleashed through Triumphant (hgss1–hgss4)',
      'Call of Legends added (col1) as an HGSS-era expansion with SL shiny legendary Secret Rares (SL1–SL11)',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-05-20',
    entries: [
      'Set search bars added across list screens — Open Packs, Collection, and Achievements now support searching sets by name, series, or year',
      'Collection filter update — Hide completed sets moved into the filter popup and now appears in active filter chips/badge count',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-05-20',
    entries: [
      'Card grading system added — grade cards 1-10 with rarity-aware grade rolls and sell-value multipliers',
      'Collection grading flow — submit cards to grading from fullscreen view with slab reveal and grade results',
      'Graded collection support — graded copies are tracked per grade and shown in dedicated graded views/filters',
      'Showcase grading support — add both graded and ungraded variants of a favourited card, with optional slab display toggle',
      'Fullscreen card details fix — card modal now shows the correct set name for each card instead of always displaying Base Set',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-05-20',
    entries: [
      'Full Diamond & Pearl series added — Diamond & Pearl through Stormfront (dp1–dp7)',
      'Stormfront Shiny cards added as a dedicated rarity tier (SH1–SH3), separate from LV.X cards',
      'LV.X and Shiny support polished across pulls, collection filters, badges, and achievements',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-05-20',
    entries: [
      'Onboarding tutorial — 6-slide guide shown on first load with animated previews; final slide lets you pick Sandbox or Economy mode before starting',
      'Pity system (Economy mode) — guaranteed holo after 10 packs in a row without a hit; a pip meter below the pack shows your progress',
      'Economy rebalance — sell prices now scale with each set\'s pack price, ensuring a worst-case pack always recoups its cost; holos and reverse holos fetch a bonus',
      'Energy-type filter — chip row in the Collection screen lets you filter cards by type (Fire, Water, Grass, etc.)',
      'Secret Rare filter tab — appears in Collection only for sets that contain Secret Rares; Secret Rares sort to the top of the grid',
      'Achievement toasts — tiered visual notifications (Common / Uncommon / Rare / Holo) replace the old blocking modal; Holo tier includes confetti',
      'Secret Rare reveal animation — shake buildup before flip, bounce-toward-viewer scale on reveal with crimson glow',
      'Fixed: achievement icons corrupted for all pre-EX sets',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-05-19',
    entries: [
      'Favourites — heart any card in the fullscreen view to save it to your favourites',
      'Favourites collection — browse all your favourite cards in one place from the Collection screen',
      'Showcase — curate up to 10 favourite cards and export a shareable PNG image',
      'Stats — track packs opened and most-pulled card per set',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-05-19',
    entries: [
      'Full EX series added — EX Ruby & Sapphire through EX Power Keepers (ex1–ex16)',
      'EX Pokémon cards detected by name and show an EX badge instead of the holo symbol',
      'Series and year filters added to the Collection and Achievements screens',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-05-19',
    entries: [
      'Set selector now has series and year filters with a popup panel',
      'Sets labelled with their series (Base, Neo, Legendary Collection, e-Card)',
      'Reset Progress option in Settings — clears collection, coins, and achievements without wiping card caches',
      'Economy mode uses a separate collection so sandbox cards cannot be sold for coins',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-05-18',
    entries: [
      'Economy Mode (beta) — buy packs with coins, earn coins by opening packs and selling duplicates',
      'Coin flip mini-game when broke — win to earn a free pack',
      'Free packs awarded for completing achievements — harder achievements give more packs',
      'Free packs are set-specific, awarded only for sets you already own cards from',
      'Holo is now a separate property from rarity — cards can be Rare + Holo simultaneously',
      'Collection filter tabs updated: Holo filter shows all holo cards regardless of rarity',
      'Card rarity badges now show rarity symbol and holo ✦ in distinct colours',
      'Fullscreen card view shows holo status alongside rarity',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-18',
    entries: [
      'Mobile card tilt — gyroscope support on Android and iOS, touch drag as fallback',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-05-18',
    entries: [
      'All 14 WotC-era sets available — Base Set through Skyridge',
      'Open packs, collect cards, and track your full collection per set',
      'Achievement system with milestones for each rarity tier and full set completion',
      'Secret Rares in Neo Revelation, Neo Destiny, and Team Rocket',
    ],
  },
];

export default function Settings({
  onClose,
  mode = 'sandbox',
  onModeChange,
  onResetProgress,
  onRecheckAchievements,
  onExportSave,
  onImportSave,
  coins = 0,
  difficultyProfiles = { sandbox: 'standard', economy: 'regular' },
  economyDifficultyCostContext = null,
  onChangeDifficulty,
}) {
  const [gyroDisabled, setGyroDisabled] = useState(
    () => localStorage.getItem('pkmon_gyro_disabled') === 'true'
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [recheckStatus, setRecheckStatus] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [passphraseOpen, setPassphraseOpen] = useState(false);
  const [passphraseLabel, setPassphraseLabel] = useState('');
  const [passphraseValue, setPassphraseValue] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [difficultyStatus, setDifficultyStatus] = useState('');
  const importInputRef = useRef(null);
  const passphraseResolveRef = useRef(null);
  const activeDifficultyId = mode === 'economy' ? difficultyProfiles.economy : difficultyProfiles.sandbox;

  const toggleGyro = () => {
    const next = !gyroDisabled;
    setGyroDisabled(next);
    if (next) {
      localStorage.setItem('pkmon_gyro_disabled', 'true');
    } else {
      localStorage.removeItem('pkmon_gyro_disabled');
    }
  };

  const handleReset = () => {
    onResetProgress?.();
    setConfirmReset(false);
    onClose();
  };

  const handleRecheckAchievements = () => {
    if (!onRecheckAchievements || recheckBusy) return;
    setRecheckBusy(true);
    setRecheckStatus('');
    try {
      const result = onRecheckAchievements() ?? { claimedCount: 0, packsAwarded: 0 };
      const claimedCount = result.claimedCount ?? 0;
      const packsAwarded = result.packsAwarded ?? 0;
      if (claimedCount > 0) {
        setRecheckStatus(`Recheck complete: restored ${claimedCount} achievement${claimedCount !== 1 ? 's' : ''}${packsAwarded > 0 ? ` and awarded ${packsAwarded} free pack${packsAwarded !== 1 ? 's' : ''}` : ''}.`);
      } else {
        setRecheckStatus('Recheck complete: no missing achievements found.');
      }
    } catch {
      setRecheckStatus('Recheck failed. Please try again.');
    } finally {
      setRecheckBusy(false);
    }
  };

  const askPassphrase = (label) => {
    setPassphraseLabel(label);
    setPassphraseValue('');
    setPassphraseError('');
    setPassphraseOpen(true);
    return new Promise((resolve) => {
      passphraseResolveRef.current = resolve;
    });
  };

  const closePassphraseDialog = (value) => {
    setPassphraseOpen(false);
    setPassphraseValue('');
    setPassphraseError('');
    const resolve = passphraseResolveRef.current;
    passphraseResolveRef.current = null;
    if (resolve) resolve(value);
  };

  const handlePassphraseConfirm = () => {
    if (passphraseValue.length < 8) {
      setPassphraseError('Passphrase must be at least 8 characters.');
      return;
    }
    closePassphraseDialog(passphraseValue);
  };

  const handleExportSave = async (targetMode) => {
    if (!onExportSave || saveBusy) return;
    const passphrase = await askPassphrase(`Export ${targetMode} save`);
    if (!passphrase) return;

    setSaveBusy(true);
    setSaveStatus('');
    try {
      await onExportSave(targetMode, passphrase);
      setSaveStatus(`${targetMode === 'economy' ? 'Economy' : 'Sandbox'} save exported successfully.`);
    } catch (err) {
      setSaveStatus(err?.message ?? 'Export failed.');
    } finally {
      setSaveBusy(false);
    }
  };

  const handleImportClick = () => {
    if (!onImportSave || saveBusy) return;
    importInputRef.current?.click();
  };

  const handleImportChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImportSave || saveBusy) return;

    const passphrase = await askPassphrase('Import save file');
    if (!passphrase) return;

    setSaveBusy(true);
    setSaveStatus('');
    try {
      const result = await onImportSave(file, passphrase);
      const importedMode = result?.mode === 'economy' ? 'Economy' : 'Sandbox';
      setSaveStatus(`${importedMode} save imported. Reloading...`);
      setTimeout(() => window.location.reload(), 250);
    } catch (err) {
      setSaveStatus(err?.message ?? 'Import failed.');
      setSaveBusy(false);
    }
  };

  const handleDifficultyChange = (nextDifficultyId) => {
    if (!onChangeDifficulty) return;
    const result = onChangeDifficulty(mode, nextDifficultyId);
    if (!result?.ok) {
      setDifficultyStatus(result?.message ?? 'Could not change difficulty.');
      return;
    }
    if (mode === 'economy' && (result.cost ?? 0) > 0) {
      setDifficultyStatus(`Difficulty updated. ${result.cost.toLocaleString()} coins spent.`);
      return;
    }
    setDifficultyStatus('Difficulty updated.');
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3 className="settings-section__title">Preferences</h3>
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Gyroscope card tilt (when available)</span>
              <label className="settings-toggle">
                <input type="checkbox" checked={!gyroDisabled} onChange={toggleGyro} />
                <span className="settings-toggle-track" />
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section__title">
              Experimental
              <span className="settings-badge settings-badge--exp">Beta</span>
            </h3>
            <div className="settings-toggle-row">
              <div>
                <span className="settings-toggle-label">Economy Mode</span>
                <p className="settings-toggle-desc">Buy packs with coins, sell duplicates, and flip a coin when you are broke.</p>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={mode === 'economy'}
                  onChange={() => onModeChange?.(mode === 'economy' ? 'sandbox' : 'economy')}
                />
                <span className="settings-toggle-track" />
              </label>
            </div>

            <div className="settings-difficulty">
              <span className="settings-toggle-label">{mode === 'economy' ? 'Economy Difficulty' : 'Sandbox Difficulty'}</span>
              <p className="settings-toggle-desc">
                {mode === 'economy'
                  ? 'Switching to easier economy difficulties costs coins. Moving to harder difficulties is free.'
                  : 'Collector reduces duplicate pulls while opening packs.'}
              </p>
              <div className="settings-difficulty-options">
                {mode === 'economy'
                  ? Object.values(ECONOMY_DIFFICULTIES).map((difficulty) => {
                      const cost = getEconomyDifficultyChangeCost(
                        difficultyProfiles.economy,
                        difficulty.id,
                        economyDifficultyCostContext,
                      );
                      const disabled = activeDifficultyId === difficulty.id || (cost > 0 && coins < cost);
                      return (
                        <button
                          key={difficulty.id}
                          type="button"
                          className={`settings-difficulty-option${activeDifficultyId === difficulty.id ? ' settings-difficulty-option--active' : ''}`}
                          onClick={() => handleDifficultyChange(difficulty.id)}
                          disabled={disabled}
                        >
                          <span className="settings-difficulty-option__label">{difficulty.label}</span>
                          <span className="settings-difficulty-option__desc">{difficulty.description}</span>
                          {cost > 0 && <span className="settings-difficulty-option__cost">Cost: {cost.toLocaleString()} coins</span>}
                        </button>
                      );
                    })
                  : Object.values(SANDBOX_DIFFICULTIES).map((difficulty) => (
                      <button
                        key={difficulty.id}
                        type="button"
                        className={`settings-difficulty-option${activeDifficultyId === difficulty.id ? ' settings-difficulty-option--active' : ''}`}
                        onClick={() => handleDifficultyChange(difficulty.id)}
                        disabled={activeDifficultyId === difficulty.id}
                      >
                        <span className="settings-difficulty-option__label">{difficulty.label}</span>
                        <span className="settings-difficulty-option__desc">{difficulty.description}</span>
                      </button>
                    ))}
              </div>
              {difficultyStatus && <p className="settings-recheck-status">{difficultyStatus}</p>}
            </div>
          </section>

          <section className="settings-section settings-section--danger">
            <h3 className="settings-section__title">Data</h3>
            <div className="settings-save-row">
              <button
                className="btn-reset btn-reset--save"
                onClick={() => handleExportSave('sandbox')}
                disabled={saveBusy}
              >
                Export Sandbox
              </button>
              <button
                className="btn-reset btn-reset--save"
                onClick={() => handleExportSave('economy')}
                disabled={saveBusy}
              >
                Export Economy
              </button>
              <button
                className="btn-reset btn-reset--save-import"
                onClick={handleImportClick}
                disabled={saveBusy}
              >
                {saveBusy ? 'Working...' : 'Import Save'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".pkmonsave,.json"
                className="settings-file-input"
                onChange={handleImportChange}
              />
            </div>
            <p className="settings-toggle-desc">Save files are encrypted and include checksum validation. Imports are mode-aware and only apply to their own mode profile.</p>
            {saveStatus && <p className="settings-recheck-status">{saveStatus}</p>}
            <div className="settings-toggle-row settings-toggle-row--stack">
              <div>
                <span className="settings-toggle-label">Recheck Achievements</span>
                <p className="settings-toggle-desc">Scan all achievements and restore any completed ones missing from save data.</p>
                {recheckStatus && <p className="settings-recheck-status">{recheckStatus}</p>}
              </div>
              <button
                className="btn-reset btn-reset--recheck"
                onClick={handleRecheckAchievements}
                disabled={recheckBusy}
              >
                {recheckBusy ? 'Checking...' : 'Recheck'}
              </button>
            </div>
            {confirmReset ? (
              <div className="settings-reset-confirm">
                <p className="settings-reset-confirm__text">
                  This will delete your {mode === 'economy' ? 'economy' : 'sandbox'} collection, coins, free packs, and achievements. Card caches are kept. This cannot be undone.
                </p>
                <div className="settings-reset-confirm__btns">
                  <button className="btn-reset btn-reset--cancel" onClick={() => setConfirmReset(false)}>Cancel</button>
                  <button className="btn-reset btn-reset--confirm" onClick={handleReset}>Yes, reset</button>
                </div>
              </div>
            ) : (
              <div className="settings-toggle-row">
                <div>
                  <span className="settings-toggle-label">Reset Progress</span>
                  <p className="settings-toggle-desc">Delete your current collection, coins, and achievements. Caches are kept.</p>
                </div>
                <button className="btn-reset btn-reset--open" onClick={() => setConfirmReset(true)}>Reset</button>
              </div>
            )}
          </section>

          <section className="settings-section">
            <h3 className="settings-section__title">Changelog</h3>
            <div className="changelog">
              {CHANGELOG.map((release) => (
                <div key={release.version} className="changelog-entry">
                  <div className="changelog-entry__header">
                    <span className="changelog-entry__version">v{release.version}</span>
                    <span className="changelog-entry__date">{release.date}</span>
                  </div>
                  <ul className="changelog-entry__list">
                    {release.entries.map((entry, i) => (
                      <li key={i}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>

        {passphraseOpen && (
          <div className="settings-passphrase-overlay" onClick={() => closePassphraseDialog(null)}>
            <div className="settings-passphrase-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="settings-passphrase-title">{passphraseLabel}</h3>
              <p className="settings-toggle-desc">Enter your save passphrase to continue.</p>
              <input
                className="settings-passphrase-input"
                type="password"
                value={passphraseValue}
                onChange={(e) => setPassphraseValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePassphraseConfirm();
                  if (e.key === 'Escape') closePassphraseDialog(null);
                }}
                autoFocus
              />
              {passphraseError && <p className="settings-passphrase-error">{passphraseError}</p>}
              <div className="settings-passphrase-actions">
                <button className="btn-reset btn-reset--cancel" onClick={() => closePassphraseDialog(null)}>Cancel</button>
                <button className="btn-reset btn-reset--save-import" onClick={handlePassphraseConfirm}>Continue</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}