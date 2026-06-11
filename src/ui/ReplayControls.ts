/**
 * Replay transport bar: play/pause/step/fast-forward/free-cam/exit plus a
 * live status line. A lightweight HUD-style widget (not a Screen) so the
 * 3D replay stays visible and interactive underneath.
 */

import { el, button } from './dom';

export type ReplayControlAction = 'play' | 'pause' | 'step' | 'ff' | 'freecam' | 'exit';

export class ReplayControls {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;

  constructor(parent: HTMLElement, onAction: (a: ReplayControlAction) => void) {
    this.status = el('div', { className: 'mono muted' });
    this.status.id = 'replay-status';
    this.root = el('div');
    this.root.id = 'replay-controls';
    this.root.append(
      button('▶ Play', () => onAction('play')),
      button('⏸ Pause', () => onAction('pause')),
      button('⏭ Step', () => onAction('step')),
      button('⏩ Fast-forward', () => onAction('ff')),
      button('🎥 Free camera', () => onAction('freecam')),
      button('Exit replay', () => onAction('exit'), 'btn btn-danger'),
      this.status,
    );
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
