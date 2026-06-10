/**
 * Main menu: run launcher (map cycling, custom seed, daily challenge),
 * settings, save import/export, high-score readout.
 */

import { MAPS } from '../../config/maps';
import { dailySeed } from '../../core/Rng';
import { el, button } from '../dom';
import type { Screen } from '../UIManager';
import type { GameApi } from './api';

export function createMainMenu(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  let mapIndex = 0;
  let seedText = '';

  const panel = el('div', { className: 'panel' });
  panel.style.minWidth = '460px';

  const title = el('div', {}, [
    el('div', { className: 'title-xl', text: 'HORDEFALL' }),
    el('div', { className: 'title-sub', text: 'they are already on their way' }),
  ]);
  title.style.marginBottom = '30px';

  const mapBtn = button('', () => {
    mapIndex = (mapIndex + 1) % MAPS.length;
    refreshMapButton();
  }, 'btn btn-phosphor');
  const refreshMapButton = (): void => {
    mapBtn.replaceChildren(
      document.createTextNode(`Arena: ${MAPS[mapIndex].name}`),
      el('span', { className: 'btn-note', text: 'click to cycle' }),
    );
  };
  refreshMapButton();

  const seedInput = el('input');
  seedInput.type = 'text';
  seedInput.placeholder = 'custom seed (blank = random)';
  seedInput.style.cssText =
    'width:100%;margin-top:10px;background:#1a1114;border:1px solid rgba(255,122,46,0.35);color:#e8ded2;padding:10px 14px;font-family:JetBrains Mono,monospace;font-size:13px;pointer-events:auto;';
  seedInput.addEventListener('input', () => (seedText = seedInput.value));

  const highScore = el('div', { className: 'muted mono' });
  highScore.style.marginTop = '22px';

  const importInput = el('input');
  importInput.type = 'file';
  importInput.accept = '.json';
  importInput.style.display = 'none';
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      const result = api.saveManager.importJson(text);
      alert(result.ok ? 'Save imported.' : `Import failed: ${result.error}`);
      if (result.ok) window.location.reload();
    });
  });

  panel.append(
    title,
    button('Deploy', () => {
      const seed = seedText.trim() ? hashSeed(seedText.trim()) : Math.floor(Math.random() * 0xffffffff);
      api.startRun(MAPS[mapIndex].id, seed, false);
    }),
    button('Daily Challenge', () => {
      api.startRun(MAPS[dailySeed(new Date()) % MAPS.length].id, dailySeed(new Date()), true);
    }, 'btn btn-phosphor', new Date().toISOString().slice(0, 10)),
    mapBtn,
    seedInput,
    button('Settings', () => {
      api.ui.settingsReturnTo = 'main-menu';
      api.openScreen('settings');
    }),
    button('Export Save', () => {
      const blob = new Blob([api.saveManager.exportJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hordefall-save.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }),
    button('Import Save', () => importInput.click()),
    importInput,
    highScore,
  );
  root.appendChild(panel);

  return {
    root,
    onShow: () => {
      const data = api.saveData;
      const best = data.highScores.slice().sort((a, b) => b.score - a.score)[0];
      highScore.textContent = best
        ? `BEST: ${best.score.toLocaleString()} pts — wave ${best.wave}  |  runs: ${data.profile.totalRuns}  |  achievements: ${data.profile.achievements.length}`
        : 'No runs on record. The horde is patient.';
    },
  };
}

function hashSeed(text: string): number {
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber !== 0) return Math.abs(Math.floor(asNumber)) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
