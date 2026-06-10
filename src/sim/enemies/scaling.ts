/**
 * Difficulty scaling: per-wave stat growth with capped speed, elite
 * multipliers, and per-boss-number boss scaling.
 */

import type { EnemyConfig, EnemyScalingConfig } from '../../config/types';
import { expCurve } from '../../core/math';

export interface ScaledEnemyStats {
  hp: number;
  damage: number;
  speed: number;
  scale: number;
  xp: number;
  score: number;
}

export function scaleEnemy(
  cfg: EnemyConfig,
  wave: number,
  scaling: EnemyScalingConfig,
  elite: boolean,
): ScaledEnemyStats {
  const w = Math.max(0, wave - 1);
  const hpMult = (1 + scaling.hpPerWave * w) * expCurve(1, scaling.hpGrowth, w);
  const dmgMult = 1 + scaling.damagePerWave * w;
  const speedMult = Math.min(scaling.speedCap, 1 + scaling.speedPerWave * w);
  const rewardMult = 1 + 0.05 * w;

  return {
    hp: cfg.hp * hpMult * (elite ? scaling.eliteHpMult : 1),
    damage: cfg.damage * dmgMult * (elite ? scaling.eliteDamageMult : 1),
    speed: cfg.speed * speedMult,
    scale: cfg.scale * (elite ? scaling.eliteScale : 1),
    xp: Math.round(cfg.xp * rewardMult * (elite ? 2 : 1)),
    score: Math.round(cfg.score * rewardMult * (elite ? 2 : 1)),
  };
}

/** Boss stats grow with how many bosses have already been faced. */
export function scaleBoss(
  cfg: EnemyConfig,
  bossNumber: number,
  scaling: EnemyScalingConfig,
): ScaledEnemyStats {
  const n = Math.max(0, bossNumber - 1);
  const mult = 1 + scaling.bossHpPerBossNumber * n;
  return {
    hp: cfg.hp * mult,
    damage: cfg.damage * (1 + 0.2 * n),
    speed: cfg.speed,
    scale: cfg.scale,
    xp: Math.round(cfg.xp * (1 + 0.5 * n)),
    score: Math.round(cfg.score * (1 + 0.5 * n)),
  };
}
