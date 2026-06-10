/**
 * Melee swing resolution: cone check on the XZ plane against nearby enemies,
 * damage through the standard on-hit pipeline, knockback away from the
 * player. Module-level scratch keeps swings allocation-free.
 */

import type { WeaponConfig } from '../../config/types';
import type { GameBus } from '../events';
import type { Rng } from '../../core/Rng';
import type { CombatContext } from './context';
import type { EffectiveWeaponStats, FireView } from '../weapons';
import { applyOnHitEffects } from './onHit';

const hitScratch: number[] = [];

export function swingMelee(
  cfg: WeaponConfig,
  eff: EffectiveWeaponStats,
  view: FireView,
  ctx: CombatContext,
  rng: Rng,
  bus: GameBus,
): void {
  const spec = cfg.melee!;
  ctx.stats.recordShot(cfg.id);
  bus.emit('weapon:fired', { weaponId: cfg.id });
  bus.emit('weapon:recoil', { pitchDeg: cfg.recoilPitchDeg, yawDeg: (rng.next() - 0.5) * 2 * cfg.recoilYawDeg });

  // Forward on the XZ plane (melee reach ignores pitch).
  let fx = view.dx;
  let fz = view.dz;
  const fl = Math.sqrt(fx * fx + fz * fz) || 1;
  fx /= fl;
  fz /= fl;
  const cosHalfArc = Math.cos((spec.arcDeg * Math.PI) / 360);

  hitScratch.length = 0;
  ctx.enemies.queryRadius(view.ox, view.oz, spec.range + 1.5, hitScratch);
  let landed = false;
  for (const idx of hitScratch) {
    const ex = ctx.enemies.posX[idx] - view.ox;
    const ez = ctx.enemies.posZ[idx] - view.oz;
    const reach = spec.range + ctx.enemies.configOf(idx).radius * ctx.enemies.scale[idx];
    const d = Math.sqrt(ex * ex + ez * ez) || 1e-5;
    if (d > reach) continue;
    if ((ex / d) * fx + (ez / d) * fz < cosHalfArc) continue;

    const result = ctx.enemies.applyDamage(idx, eff.damage, {
      fromX: view.ox, fromZ: view.oz, isHead: false, isCrit: false, byPlayer: true, weaponId: cfg.id,
    });
    ctx.stats.damageDealt += result.applied;
    if (!landed && result.applied > 0) {
      ctx.stats.shotsHit++;
      landed = true;
    }
    if (result.killed) ctx.stats.recordKill(cfg.id);
    if (result.applied > 0) {
      ctx.enemies.velX[idx] += (ex / d) * spec.knockback;
      ctx.enemies.velZ[idx] += (ez / d) * spec.knockback;
      applyOnHitEffects(ctx, idx, ctx.enemies.posX[idx], view.oy, ctx.enemies.posZ[idx], result.applied);
    }
  }
}
