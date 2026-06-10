/**
 * Developer menu: stress tests, spawn controls, cheats, and AI/collision
 * visualization toggles. Reachable from pause (F8) or the dev console.
 */

import { el, button } from '../dom';
import type { Screen } from '../UIManager';
import type { GameApi } from './api';
import { ENEMIES } from '../../config/enemies';

export function createDebugMenu(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  const panel = el('div', { className: 'panel' });
  panel.style.minWidth = '560px';

  const status = el('div', { className: 'muted mono' });

  const stressRow = el('div', { className: 'row' });
  for (const count of [100, 250, 500, 750, 1000]) {
    const b = button(String(count), () => {
      api.devStress(count);
      refresh();
    }, 'btn');
    b.style.textAlign = 'center';
    stressRow.appendChild(b);
  }

  const spawnRow = el('div', { className: 'shop-grid' });
  for (const enemy of ENEMIES) {
    spawnRow.appendChild(button(`Spawn 5× ${enemy.name}`, () => {
      api.devSpawn(enemy.id, 5);
      refresh();
    }));
  }

  const toggles = el('div');
  const refresh = (): void => {
    const sim = api.sim;
    const dd = api.debugDraw;
    status.textContent = sim
      ? `alive: ${sim.enemies.aliveCount} | wave: ${sim.waves.wave} (${sim.waves.state}) | god: ${sim.player.godMode} | noclip: ${sim.player.noclip}`
      : 'no active run — start a run first';
    toggles.replaceChildren(
      button(`God mode: ${sim?.player.godMode ? 'ON' : 'off'}`, () => { api.devGod(); refresh(); }),
      button(`Noclip: ${sim?.player.noclip ? 'ON' : 'off'}`, () => { api.devNoclip(); refresh(); }),
      button(`Hitboxes: ${dd?.showHitboxes ? 'ON' : 'off'}`, () => { if (dd) dd.showHitboxes = !dd.showHitboxes; refresh(); }),
      button(`AI states: ${dd?.showAiState ? 'ON' : 'off'}`, () => { if (dd) dd.showAiState = !dd.showAiState; refresh(); }),
      button(`Steering: ${dd?.showSteering ? 'ON' : 'off'}`, () => { if (dd) dd.showSteering = !dd.showSteering; refresh(); }),
      button(`Spawn points: ${dd?.showSpawnPoints ? 'ON' : 'off'}`, () => { if (dd) dd.showSpawnPoints = !dd.showSpawnPoints; refresh(); }),
      button(`AI throttling: ${sim?.aiThrottle === false ? 'OFF' : 'on'}`, () => { if (sim) sim.aiThrottle = !sim.aiThrottle; refresh(); }),
      button('Skip wave / end break', () => { api.devSkipWave(); refresh(); }),
      button('Force boss next wave', () => { api.devForceBoss(); refresh(); }),
      button('Unlock all weapons', () => { api.devUnlockAll(); refresh(); }),
      button('Kill all enemies', () => { api.devKillAll(); refresh(); }, 'btn btn-danger'),
    );
  };

  panel.append(
    el('div', { className: 'heading', text: 'Developer' }),
    status,
    el('div', { className: 'muted', text: 'STRESS TEST — spawn N enemies in a ring' }),
    stressRow,
    toggles,
    el('div', { className: 'muted', text: 'SPAWN CONTROLS' }),
    spawnRow,
    button('Close', () => api.resumeGame(), 'btn btn-phosphor'),
  );
  root.appendChild(panel);

  return { root, onShow: refresh };
}
