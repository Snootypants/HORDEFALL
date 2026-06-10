/**
 * Effective weapon stat computation: shipped config × purchased tiers
 * (minus tuning-disabled ones) × tuning damage override × player stat sheet.
 */

import type { WeaponConfig } from '../config/types';
import type { TuningOverrides } from './tuning';
import type { StatSheet } from './progression/upgradeEffects';

export interface EffectiveWeaponStats {
  damage: number;
  rpm: number;
  magSize: number;
  reloadTime: number;
  spreadDeg: number;
}

export function effectiveWeaponStats(
  cfg: WeaponConfig,
  ownedTiers: number,
  tuning: TuningOverrides,
  stats: StatSheet,
): EffectiveWeaponStats {
  let damage = cfg.damage * (tuning.weaponDamageMult[cfg.id] ?? 1);
  let rpm = cfg.rpm;
  let magSize = cfg.magSize;
  let reloadTime = cfg.reloadTime;
  let spreadDeg = cfg.spreadDeg;
  const disabled = tuning.disabledTiers[cfg.id];
  for (let t = 0; t < ownedTiers && t < cfg.upgrades.length; t++) {
    if (disabled && disabled.includes(t)) continue;
    const tier = cfg.upgrades[t];
    if (tier.damageMult) damage *= tier.damageMult;
    if (tier.rpmMult) rpm *= tier.rpmMult;
    if (tier.magBonus) magSize += tier.magBonus;
    if (tier.reloadMult) reloadTime *= tier.reloadMult;
    if (tier.spreadMult) spreadDeg *= tier.spreadMult;
  }
  return {
    damage: damage * stats.damageMult,
    rpm: rpm * stats.fireRateMult,
    magSize: Math.round(magSize * stats.magSizeMult),
    reloadTime: reloadTime / stats.reloadSpeedMult,
    spreadDeg,
  };
}
