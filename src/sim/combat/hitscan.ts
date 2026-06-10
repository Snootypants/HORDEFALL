/**
 * Hitscan pellet resolution: world raycast, barrel hits, then pierce through
 * enemies with falloff/headshot/crit/weak-point damage, on-hit effects, and
 * tracer/impact events. Module-level scratch keeps pellets allocation-free.
 */

import type { WeaponConfig } from '../../config/types';
import type { GameBus } from '../events';
import type { Rng } from '../../core/Rng';
import type { CombatContext } from './context';
import type { EffectiveWeaponStats } from '../weaponStats';
import type { FireView } from '../weapons';
import { computeHitDamage } from './damage';
import { applyOnHitEffects, applyRicochet } from './onHit';
import { raycastEnemies, hitsWeakPoint } from '../enemies/enemyQueries';

const hitIdx: number[] = [];
const hitT: number[] = [];
const hitHead: boolean[] = [];
const barrelT: number[] = [0];

export function firePellet(
  cfg: WeaponConfig,
  eff: EffectiveWeaponStats,
  view: FireView,
  dx: number, dy: number, dz: number,
  ctx: CombatContext,
  rng: Rng,
  bus: GameBus,
): void {
  const wallHit = ctx.collision.raycast(view.ox, view.oy, view.oz, dx, dy, dz, cfg.range);
  let maxT = wallHit ? wallHit.t : cfg.range;
  const wallNx = wallHit?.nx ?? 0;
  const wallNy = wallHit?.ny ?? 0;
  const wallNz = wallHit?.nz ?? 0;
  const hadWall = wallHit !== null;

  const barrelIdx = ctx.barrels.raycast(view.ox, view.oy, view.oz, dx, dy, dz, maxT, barrelT);
  if (barrelIdx >= 0) {
    ctx.barrels.damage(barrelIdx, eff.damage, ctx.enemies, ctx.bus, ctx.playerPos, ctx.damagePlayer);
    maxT = Math.min(maxT, barrelT[0]);
  }

  const stats = ctx.player().stats;
  const pierceMax = 1 + cfg.pierce + stats.pierceBonus;
  const n = raycastEnemies(ctx.enemies, view.ox, view.oy, view.oz, dx, dy, dz, maxT, hitIdx, hitT, hitHead);

  let lastT = maxT;
  let hits = 0;
  for (let h = 0; h < n && hits < pierceMax; h++) {
    const idx = hitIdx[h];
    const t = hitT[h];
    const isHead = hitHead[h];
    const weakPoint = ctx.enemies.bossIdx === idx && hitsWeakPoint(ctx.enemies, idx, view.ox, view.oy, view.oz, dx, dy, dz);
    const { damage, isCrit } = computeHitDamage({
      baseDamage: eff.damage,
      distance: t,
      falloffStart: cfg.falloffStart,
      range: cfg.range,
      falloffMinMult: cfg.falloffMinMult,
      isHeadshot: isHead,
      headshotMult: cfg.headshotMult,
      damageMult: 1, // player damageMult already in eff.damage
      critChance: stats.critChance,
      critMult: stats.critMult,
      critRoll: rng.next(),
      weakPointMult: weakPoint ? ctx.enemies.configOf(idx).boss!.weakPointMult : undefined,
    });
    const result = ctx.enemies.applyDamage(idx, damage, {
      fromX: view.ox, fromZ: view.oz, isHead, isCrit, byPlayer: true, weaponId: cfg.id,
    });
    ctx.stats.damageDealt += result.applied;
    if (hits === 0) ctx.stats.shotsHit++;
    if (isHead && result.applied > 0) ctx.stats.headshots++;
    if (result.killed) ctx.stats.recordKill(cfg.id);
    const hx = view.ox + dx * t;
    const hy = view.oy + dy * t;
    const hz = view.oz + dz * t;
    if (result.applied > 0) {
      applyOnHitEffects(ctx, idx, hx, hy, hz, result.applied);
      if (ctx.player().flags.has('ricochet')) applyRicochet(ctx, idx, hx, hy, hz, result.applied);
    }
    lastT = t;
    hits++;
    if (result.shielded) break; // shields stop the pellet cold
  }

  // Tracer to last obstruction; wall impact if nothing soft absorbed it.
  const endT = hits >= pierceMax ? lastT : maxT;
  bus.emit('tracer', {
    x0: view.ox, y0: view.oy - 0.12, z0: view.oz,
    x1: view.ox + dx * endT, y1: view.oy + dy * endT, z1: view.oz + dz * endT,
    color: cfg.tracerColor,
  });
  if (hits === 0 && hadWall) {
    bus.emit('impact', {
      x: view.ox + dx * maxT, y: view.oy + dy * maxT, z: view.oz + dz * maxT,
      nx: wallNx, ny: wallNy, nz: wallNz, surface: 'world',
    });
  }
}
