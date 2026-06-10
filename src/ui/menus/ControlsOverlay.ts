/**
 * First-run controls overlay: shown once, before the player's very first
 * deployment (and before pointer lock), so nobody has to guess the keys.
 */

import { el, button } from '../dom';
import type { Screen } from '../UIManager';
import type { GameApi } from './api';

const CONTROLS: [string, string][] = [
  ['WASD', 'move'],
  ['SHIFT', 'sprint'],
  ['SPACE', 'jump'],
  ['CTRL', 'crouch'],
  ['LMB', 'fire'],
  ['RMB', 'aim'],
  ['R', 'reload'],
  ['1–6 / SCROLL', 'switch weapon'],
  ['0', 'melee — never runs dry'],
  ['B', 'armory (between waves)'],
  ['ESC', 'pause'],
  ['F3 / F8 / ~', 'perf · dev menu · console'],
];

export function createControlsOverlay(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  const panel = el('div', { className: 'panel' });
  panel.style.minWidth = '420px';
  const grid = el('div', { className: 'stat-grid' });
  for (const [key, what] of CONTROLS) {
    grid.append(
      el('span', { className: 'k mono', text: key }),
      el('span', { className: 'v', text: what }),
    );
  }
  panel.append(
    el('div', { className: 'heading', text: 'Field Manual' }),
    el('div', { className: 'muted', text: 'one-time briefing — survive the waves, spend the breaks' }),
    grid,
    button('DEPLOY', () => api.confirmControls(), 'btn btn-phosphor'),
  );
  root.appendChild(panel);
  return { root };
}
