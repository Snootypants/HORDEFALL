/**
 * Registers every UI screen against the UIManager. Kept out of Game.ts so
 * the orchestrator stays focused on lifecycle and the loop.
 */

import type { Game } from './Game';
import { createMainMenu } from '../ui/menus/MainMenu';
import { createSettingsMenu } from '../ui/menus/SettingsMenu';
import {
  createPauseMenu,
  createUpgradeScreen,
  createShopScreen,
  createGameOverScreen,
  createLoadingScreen,
} from '../ui/menus/RunScreens';
import { createDebugMenu } from '../ui/menus/DebugMenu';
import { createControlsOverlay } from '../ui/menus/ControlsOverlay';

export function registerScreens(game: Game): void {
  const loading = createLoadingScreen();
  game.ui.register('loading', loading);
  game.ui.register('main-menu', createMainMenu(game));
  game.ui.register('settings', createSettingsMenu(game));
  game.ui.register('pause', createPauseMenu(game));
  game.ui.register('upgrade', createUpgradeScreen(game));
  game.ui.register('shop', createShopScreen(game));
  game.ui.register('game-over', createGameOverScreen(game));
  game.ui.register('debug-menu', createDebugMenu(game));
  game.ui.register('controls', createControlsOverlay(game));
}
