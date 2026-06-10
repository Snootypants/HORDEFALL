/**
 * Entry point: import styles, locate the canvas, hand off to the Game
 * orchestrator. Nothing else lives here by design — entry files import and
 * register, they don't implement.
 */

import './ui/styles.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('HORDEFALL: #game-canvas not found in index.html');
}

const game = new Game(canvas);
game.boot();

// Expose for poking around in the browser console (dev affordance).
declare global {
  interface Window {
    HORDEFALL?: Game;
  }
}
window.HORDEFALL = game;
