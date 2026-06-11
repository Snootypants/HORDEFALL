/**
 * Burning-status flame emitter collection — pure data, no THREE, so the
 * visual contract is testable headless. GameRenderer pulses particle bursts
 * from these positions; the cap bounds horde-scale cost and `out` entries
 * are reused (no per-frame allocation once warmed).
 */

import { EnemyManager, EState } from '../../sim/enemies/EnemyManager';

export interface FlameEmitter {
  x: number;
  y: number;
  z: number;
}

/**
 * Fill `out` with up to `max` emitters for alive, burning enemies (mid-body
 * height). Returns the emitter count; out.length is left at that count.
 */
export function collectFlameEmitters(mgr: EnemyManager, max: number, out: FlameEmitter[]): number {
  let n = 0;
  for (let i = 0; i < mgr.highWater && n < max; i++) {
    if (!mgr.aliveFlags[i] || mgr.state[i] === EState.Dying) continue;
    if (!mgr.status.has(i, 'burning')) continue;
    const cfg = mgr.configOf(i);
    let e = out[n];
    if (!e) {
      e = { x: 0, y: 0, z: 0 };
      out[n] = e;
    }
    e.x = mgr.posX[i];
    e.y = mgr.posY[i] + cfg.height * mgr.scale[i] * 0.55;
    e.z = mgr.posZ[i];
    n++;
  }
  out.length = n;
  return n;
}
