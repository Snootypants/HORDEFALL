/**
 * Spatial queries against the horde: hitscan raycasts (grid walk + sphere
 * tests, stamp-deduped, zero allocation) and the boss weak-point test.
 */

import { EnemyManager, EState } from './EnemyManager';
import { raySphere, rayVerticalCapsule } from '../../core/math';
import { SHAPE_DIMS } from '../../config/shapes';

const neighborScratch: number[] = [];
const volScratch = { radius: 0, yBottom: 0, yTop: 0 };

/**
 * The authoritative hit volume for an enemy: a vertical capsule sized to the
 * RENDERED body (SHAPE_DIMS × scale × height), so what the player sees is
 * what their shots test against. DebugDraw renders these same numbers.
 */
export function hitVolumeOf(mgr: EnemyManager, i: number, out = volScratch): { radius: number; yBottom: number; yTop: number } {
  const cfg = mgr.types[mgr.typeIdx[i]];
  const s = cfg.height * mgr.scale[i];
  const dims = SHAPE_DIMS[cfg.shape];
  out.radius = (dims.width / 2) * s;
  out.yBottom = mgr.posY[i];
  out.yTop = mgr.posY[i] + dims.height * s;
  return out;
}

/**
 * Raycast against live enemies. Fills the caller's parallel arrays sorted by
 * distance; returns hit count.
 */
export function raycastEnemies(
  mgr: EnemyManager,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  outIdx: number[],
  outT: number[],
  outHead: boolean[],
): number {
  outIdx.length = 0;
  outT.length = 0;
  outHead.length = 0;
  const stamp = ++mgr.stampCounter;
  const step = 3;

  for (let d = 0; d <= maxDist + step; d += step) {
    const sx = ox + dx * Math.min(d, maxDist);
    const sz = oz + dz * Math.min(d, maxDist);
    // Query padding must cover the widest hit volume (the boss is ~5.4m).
    mgr.grid.queryCircle(sx, sz, step + 7, neighborScratch);
    for (let n = 0; n < neighborScratch.length; n++) {
      const i = neighborScratch[n];
      if (mgr.raycastStamp[i] === stamp) continue;
      mgr.raycastStamp[i] = stamp;
      if (!mgr.aliveFlags[i] || mgr.state[i] === EState.Dying) continue;
      const cfg = mgr.types[mgr.typeIdx[i]];
      const vol = hitVolumeOf(mgr, i);
      const t = rayVerticalCapsule(ox, oy, oz, dx, dy, dz, mgr.posX[i], mgr.posZ[i], vol.yBottom, vol.yTop, vol.radius);
      if (t === null || t > maxDist) continue;
      const hitY = oy + dy * t;
      const isHead = hitY > vol.yBottom + (vol.yTop - vol.yBottom) * (1 - cfg.headshotZone);
      // Insertion sort by t — hit lists are tiny
      let pos = outT.length;
      while (pos > 0 && outT[pos - 1] > t) pos--;
      outIdx.splice(pos, 0, i);
      outT.splice(pos, 0, t);
      outHead.splice(pos, 0, isHead);
    }
  }
  return outIdx.length;
}

/** Boss weak-point test for a ray that already hit the boss body. */
export function hitsWeakPoint(
  mgr: EnemyManager,
  idx: number,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
): boolean {
  const cfg = mgr.types[mgr.typeIdx[idx]];
  if (!cfg.boss) return false;
  const h = cfg.height * mgr.scale[idx];
  // Weak point: glowing core on the front of the chest.
  const wx = mgr.posX[idx] - Math.sin(mgr.yaw[idx]) * cfg.radius * mgr.scale[idx] * 0.7;
  const wy = mgr.posY[idx] + h * 0.6;
  const wz = mgr.posZ[idx] - Math.cos(mgr.yaw[idx]) * cfg.radius * mgr.scale[idx] * 0.7;
  return raySphere(ox, oy, oz, dx, dy, dz, wx, wy, wz, cfg.boss.weakPointRadius * mgr.scale[idx]) !== null;
}
