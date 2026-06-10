/**
 * The narrow surface menus are allowed to touch. Game implements this;
 * screens never import Game directly (no UI → orchestrator cycle).
 */

import type { Simulation } from '../../sim/Simulation';
import type { SaveManager, SaveDataV2 } from '../../save/SaveManager';
import type { AudioManager } from '../../audio/AudioManager';
import type { InputManager } from '../../input/InputManager';
import type { UIManager, ScreenName } from '../UIManager';
import type { DebugDraw } from '../../render/DebugDraw';

export interface GameApi {
  readonly ui: UIManager;
  readonly saveManager: SaveManager;
  readonly saveData: SaveDataV2;
  readonly audio: AudioManager;
  readonly input: InputManager;
  /** Null until a run starts. */
  readonly sim: Simulation | null;
  readonly debugDraw: DebugDraw | null;

  startRun(mapId: string, seed: number | null, daily: boolean): void;
  resumeGame(): void;
  pauseGame(): void;
  quitToMenu(): void;
  retryRun(): void;
  openScreen(name: ScreenName): void;
  /** First-run controls overlay: mark seen and enter the field. */
  confirmControls(): void;
  /** Persist saveData and apply settings to live systems. */
  applySettings(): void;
  applyUpgradeChoice(id: string): void;
  /** Shop actions return false when unaffordable. */
  buyShopItem(kind: 'ammo' | 'health' | 'armor' | `unlock:${string}` | `tier:${string}`): boolean;
  /** Dev/debug hooks. */
  devSpawn(enemyId: string, count: number): void;
  devStress(count: number): void;
  devGod(): boolean;
  devNoclip(): boolean;
  devSkipWave(): void;
  devForceBoss(): void;
  devUnlockAll(): void;
  devKillAll(): void;
}
