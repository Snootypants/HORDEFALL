/**
 * Corpse policy: dying enemies linger as corpses until their timer expires,
 * but the total is capped by a budget (a graphics setting) and live spawns
 * outrank corpses when the manager is full. Oldest corpses go first.
 */

import type { EnemyManager } from './EnemyManager';
import { EState } from './EnemyManager';

/** Evict oldest corpses until the count fits the manager's budget. */
export function enforceCorpseBudget(mgr: EnemyManager): void {
  let dying = 0;
  for (let i = 0; i < mgr.highWater; i++) {
    if (mgr.aliveFlags[i] && mgr.state[i] === EState.Dying) dying++;
  }
  while (dying > mgr.corpseBudget) {
    if (!evictOldestCorpse(mgr)) break;
    dying--;
  }
}

/** Free the corpse closest to expiry. Returns false when none exist. */
export function evictOldestCorpse(mgr: EnemyManager): boolean {
  let oldest = -1;
  let oldestTimer = Infinity;
  for (let i = 0; i < mgr.highWater; i++) {
    if (mgr.aliveFlags[i] && mgr.state[i] === EState.Dying && mgr.deathTimer[i] < oldestTimer) {
      oldestTimer = mgr.deathTimer[i];
      oldest = i;
    }
  }
  if (oldest < 0) return false;
  mgr.freeSlot(oldest);
  return true;
}
