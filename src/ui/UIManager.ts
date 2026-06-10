/**
 * Screen stack: registers named screens (DOM subtrees), shows one at a time
 * over the game, and reports whether UI currently wants the mouse. The HUD is
 * not a screen — it lives alongside and is toggled independently.
 */

import { el } from './dom';

export type ScreenName =
  | 'loading'
  | 'main-menu'
  | 'pause'
  | 'settings'
  | 'upgrade'
  | 'shop'
  | 'game-over'
  | 'debug-menu'
  | 'controls'
  | 'none';

export interface Screen {
  readonly root: HTMLElement;
  /** Called every time the screen becomes visible. */
  onShow?: () => void;
  onHide?: () => void;
}

export class UIManager {
  readonly root: HTMLElement;
  private readonly screens = new Map<ScreenName, Screen>();
  current: ScreenName = 'none';
  /** Where to return from the settings screen. */
  settingsReturnTo: ScreenName = 'main-menu';

  constructor() {
    this.root = document.getElementById('ui-root') ?? document.body.appendChild(el('div', { id: 'ui-root' }));
  }

  register(name: ScreenName, screen: Screen): void {
    this.screens.set(name, screen);
    screen.root.style.display = 'none';
    this.root.appendChild(screen.root);
  }

  show(name: ScreenName): void {
    if (this.current !== 'none') {
      const prev = this.screens.get(this.current);
      if (prev) {
        prev.root.style.display = 'none';
        prev.onHide?.();
      }
    }
    this.current = name;
    if (name === 'none') return;
    const next = this.screens.get(name);
    if (next) {
      next.root.style.display = 'flex';
      next.root.classList.remove('fade-in');
      void next.root.offsetWidth; // restart animation
      next.root.classList.add('fade-in');
      next.onShow?.();
    }
  }

  get uiOpen(): boolean {
    return this.current !== 'none';
  }
}
