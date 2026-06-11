/**
 * Applies saved settings to the live subsystems (audio, input, renderer,
 * sim budgets). Kept out of Game.ts so the orchestrator stays lean.
 */

import type { Game } from './Game';

export function applyGameSettings(game: Game): void {
  game.saveManager.save(game.saveData);
  game.audio.applySettings(game.saveData.settings.audio);
  applyGameInputSettings(game);
  game.sim?.enemies.setCorpseBudget(game.saveData.settings.graphics.maxCorpses);
  if (game.renderer) {
    game.renderer.applySettings(game.saveData.settings.graphics);
    game.renderer.core.setFov(game.saveData.settings.fov);
    game.renderer.cameraRig.setBaseFov(game.saveData.settings.fov);
  }
}

export function applyGameInputSettings(game: Game): void {
  game.input.bindings = { ...game.saveData.settings.keybinds };
  game.input.mouseSensitivity = game.saveData.settings.mouseSensitivity;
  game.input.invertY = game.saveData.settings.invertY;
}

/** Browsers gate AudioContext on a user gesture — resume on the first one. */
export function wireFirstGestureAudio(audio: { resume(): void }): void {
  const resume = (): void => audio.resume();
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}
