/**
 * Shared on-hit effects from upgrade ability flags: elemental statuses with
 * shock chaining, explosive rounds, ricochet, lifesteal. Used by hitscan
 * weapons, player projectiles, and companions so behavior stays identical.
 */

import type { CombatContext } from './context';
import { clamp, dist2XZ } from '../../core/math';

const chainScratch: number[] = [];

/** Apply ability-flag effects after `applied` damage landed on enemy `idx`. */
export function applyOnHitEffects(
  ctx: CombatContext,
  idx: number,
  hitX: number,
  hitY: number,
  hitZ: number,
  applied: number,
): void {
  const { flags, stats } = ctx.player();
  const enemies = ctx.enemies;

  if (applied > 0 && stats.lifestealFrac > 0) {
    ctx.healPlayer(applied * stats.lifestealFrac);
  }

  if (flags.has('fireRounds')) enemies.applyStatus(idx, 'burning');
  if (flags.has('frostRounds')) enemies.applyStatus(idx, 'freezing');
  if (flags.has('shockRounds')) {
    enemies.applyStatus(idx, 'shock');
    // Shock arcs to up to 2 neighbors.
    enemies.queryRadius(hitX, hitZ, 5, chainScratch);
    let chained = 0;
    for (let n = 0; n < chainScratch.length && chained < 2; n++) {
      const j = chainScratch[n];
      if (j === idx) continue;
      enemies.applyStatus(j, 'shock');
      const jy = enemies.posY[j] + enemies.configOf(j).height * enemies.scale[j] * 0.5;
      ctx.bus.emit('arc:chain', { x0: hitX, y0: hitY, z0: hitZ, x1: enemies.posX[j], y1: jy, z1: enemies.posZ[j] });
      chained++;
    }
  }

  if (flags.has('explosiveRounds') && applied > 0) {
    const radius = 1.8;
    const splash = applied * 0.35;
    ctx.bus.emit('explosion', { x: hitX, y: hitY, z: hitZ, radius });
    enemies.queryRadius(hitX, hitZ, radius, chainScratch);
    for (let n = 0; n < chainScratch.length; n++) {
      const j = chainScratch[n];
      if (j === idx) continue;
      enemies.applyDamage(j, splash, {
        fromX: hitX, fromZ: hitZ, isHead: false, isCrit: false, byPlayer: true, weaponId: null,
      });
    }
  }
}

/** Ricochet: bounce a fraction of the hit to the nearest other enemy. */
export function applyRicochet(
  ctx: CombatContext,
  sourceIdx: number,
  hitX: number,
  hitY: number,
  hitZ: number,
  damage: number,
): void {
  const enemies = ctx.enemies;
  enemies.queryRadius(hitX, hitZ, 10, chainScratch);
  let best = -1;
  let bestD2 = Infinity;
  for (let n = 0; n < chainScratch.length; n++) {
    const j = chainScratch[n];
    if (j === sourceIdx) continue;
    const d2 = dist2XZ(hitX, hitZ, enemies.posX[j], enemies.posZ[j]);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = j;
    }
  }
  if (best === -1) return;
  const cfg = ctx.enemies.configOf(best);
  const ty = enemies.posY[best] + cfg.height * enemies.scale[best] * 0.5;
  ctx.bus.emit('arc:chain', { x0: hitX, y0: hitY, z0: hitZ, x1: enemies.posX[best], y1: ty, z1: enemies.posZ[best] });
  const result = enemies.applyDamage(best, damage * 0.5, {
    fromX: hitX, fromZ: hitZ, isHead: false, isCrit: false, byPlayer: true, weaponId: null,
  });
  if (result.applied > 0) applyOnHitEffects(ctx, best, enemies.posX[best], ty, enemies.posZ[best], result.applied);
}

/** Radial explosion damage to enemies with linear falloff (min 30%). */
export function explodeAt(
  ctx: CombatContext,
  x: number,
  y: number,
  z: number,
  radius: number,
  damage: number,
  weaponId: string | null,
): number {
  ctx.bus.emit('explosion', { x, y, z, radius });
  const enemies = ctx.enemies;
  enemies.queryRadius(x, z, radius, chainScratch);
  let killCount = 0;
  for (let n = 0; n < chainScratch.length; n++) {
    const j = chainScratch[n];
    const d = Math.sqrt(dist2XZ(x, z, enemies.posX[j], enemies.posZ[j]));
    const falloff = clamp(1 - d / radius, 0.3, 1);
    const result = enemies.applyDamage(j, damage * falloff, {
      fromX: x, fromZ: z, isHead: false, isCrit: false, byPlayer: true, weaponId,
    });
    ctx.stats.damageDealt += result.applied;
    if (result.killed) {
      killCount++;
      ctx.stats.recordKill(weaponId);
    }
    if (result.applied > 0) {
      applyOnHitEffects(ctx, j, enemies.posX[j], y, enemies.posZ[j], result.applied);
    }
  }
  // Barrels chain too
  for (let b = 0; b < ctx.barrels.count; b++) {
    if (!ctx.barrels.alive[b]) continue;
    if (dist2XZ(x, z, ctx.barrels.x[b], ctx.barrels.z[b]) < radius * radius) {
      ctx.barrels.damage(b, damage, ctx.enemies, ctx.bus, ctx.playerPos, ctx.damagePlayer);
    }
  }
  return killCount;
}
