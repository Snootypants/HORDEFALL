/**
 * CombatContext: everything weapon fire and projectile impacts need to
 * resolve hits. Assembled once by Simulation and reused every frame.
 */

import type { EnemyManager } from '../enemies/EnemyManager';
import type { Barrels } from '../barrels';
import type { GameBus } from '../events';
import type { Rng } from '../../core/Rng';
import type { RunStats } from '../RunStats';
import type { CollisionWorld } from '../collision';
import type { ComputedPlayerStats } from '../progression/upgradeEffects';

export interface CombatContext {
  enemies: EnemyManager;
  barrels: Barrels;
  collision: CollisionWorld;
  bus: GameBus;
  rng: Rng;
  stats: RunStats;
  /** Live computed player stats (swapped on upgrade). */
  player: () => ComputedPlayerStats;
  /** Lifesteal target. */
  healPlayer: (amount: number) => void;
  /** Player position, updated by Simulation every tick (barrel splash etc.). */
  playerPos: { x: number; z: number };
  damagePlayer: (amount: number, fromX: number, fromZ: number) => void;
}
