/**
 * Damage math. Pure functions — the weapon system feeds these per pellet/hit
 * with an injected crit roll so the sim stays deterministic under a seeded RNG.
 */

import { clamp, clamp01, invLerp, lerp } from '../../core/math';

export interface HitParams {
  baseDamage: number;
  distance: number;
  /** Damage is full up to here... */
  falloffStart: number;
  /** ...and reaches falloffMinMult at `range`. */
  range: number;
  falloffMinMult: number;
  isHeadshot: boolean;
  headshotMult: number;
  /** Aggregate damage multiplier from player stats/weapon tiers. */
  damageMult: number;
  critChance: number;
  critMult: number;
  /** Uniform [0,1) roll injected by the caller (seeded RNG). */
  critRoll: number;
  /** Boss weak-point multiplier, when the hit lands on one. */
  weakPointMult?: number;
}

export interface HitResult {
  damage: number;
  isCrit: boolean;
}

export function computeHitDamage(p: HitParams): HitResult {
  let falloffMult = 1;
  if (p.distance > p.falloffStart) {
    const t = clamp01(invLerp(p.falloffStart, p.range, p.distance));
    falloffMult = lerp(1, p.falloffMinMult, t);
  }
  const isCrit = p.critRoll < p.critChance;
  let damage = p.baseDamage * falloffMult * p.damageMult;
  if (p.isHeadshot) damage *= p.headshotMult;
  if (isCrit) damage *= p.critMult;
  if (p.weakPointMult !== undefined) damage *= p.weakPointMult;
  return { damage: Math.max(0, damage), isCrit };
}

export interface DefenseResult {
  health: number;
  armor: number;
  /** Portion soaked by armor (for shield-burst triggers / UI). */
  absorbed: number;
}

/**
 * Player damage model: armor soaks `armorAbsorb` of incoming damage while it
 * lasts; the remainder (plus any overflow once armor is gone) hits health.
 */
export function applyDamageToDefenses(
  health: number,
  armor: number,
  damage: number,
  armorAbsorb: number,
): DefenseResult {
  const wantAbsorb = damage * clamp01(armorAbsorb);
  const absorbed = clamp(wantAbsorb, 0, armor);
  const toHealth = damage - absorbed;
  return {
    health: Math.max(0, health - toHealth),
    armor: armor - absorbed,
    absorbed,
  };
}
