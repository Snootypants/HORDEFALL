/**
 * Turns owned upgrade stacks into a concrete stat sheet + ability flags.
 * Resolution order: all additive mods first, then multiplicative mods
 * compound per stack. Recomputed from scratch whenever stacks change —
 * upgrades never mutate live state directly, so they are order-independent
 * and trivially save/loadable.
 */

import type {
  AbilityFlag,
  PlayerBalanceConfig,
  StatKey,
  UpgradeConfig,
  UpgradeRarity,
} from '../../config/types';
import type { Rng } from '../../core/Rng';

export type StatSheet = Record<StatKey, number>;

const baseSheet = (player: PlayerBalanceConfig): StatSheet => ({
  maxHealth: player.maxHealth,
  maxArmor: player.maxArmor,
  armorRegenPerSec: 0,
  moveSpeedMult: 1,
  staminaRegenMult: 1,
  reloadSpeedMult: 1,
  fireRateMult: 1,
  damageMult: 1,
  critChance: 0.02,
  critMult: 1.6,
  magSizeMult: 1,
  lifestealFrac: 0,
  currencyGainMult: 1,
  xpGainMult: 1,
  pickupRadiusMult: 1,
  pierceBonus: 0,
  doubleShotChance: 0,
});

export interface ComputedPlayerStats {
  stats: StatSheet;
  flags: Set<AbilityFlag>;
  /** Stack counts for flags whose count matters (drone, turret). */
  droneCount: number;
  turretCount: number;
}

export function computePlayerStats(
  player: PlayerBalanceConfig,
  stacks: Map<string, number>,
  pool: UpgradeConfig[],
): ComputedPlayerStats {
  const stats = baseSheet(player);
  const flags = new Set<AbilityFlag>();
  let droneCount = 0;
  let turretCount = 0;

  // Additive pass
  for (const [id, rawCount] of stacks) {
    const cfg = pool.find((u) => u.id === id);
    if (!cfg) continue;
    const count = Math.min(rawCount, cfg.maxStacks);
    for (const mod of cfg.mods ?? []) {
      if (mod.add !== undefined) stats[mod.stat] += mod.add * count;
    }
  }
  // Multiplicative pass (compounds per stack)
  for (const [id, rawCount] of stacks) {
    const cfg = pool.find((u) => u.id === id);
    if (!cfg) continue;
    const count = Math.min(rawCount, cfg.maxStacks);
    for (const mod of cfg.mods ?? []) {
      if (mod.mult !== undefined) stats[mod.stat] *= Math.pow(mod.mult, count);
    }
    for (const flag of cfg.grants ?? []) {
      flags.add(flag);
      if (flag === 'drone') droneCount = count;
      if (flag === 'turret') turretCount = count;
    }
  }

  return { stats, flags, droneCount, turretCount };
}

/**
 * Roll distinct level-up choices: rarity-weighted, excluding maxed upgrades.
 * Returns fewer than `count` when the pool runs dry.
 */
export function rollUpgradeChoices(
  rng: Rng,
  pool: UpgradeConfig[],
  stacks: Map<string, number>,
  count: number,
  rarityWeights: Record<UpgradeRarity, number>,
): UpgradeConfig[] {
  const available = pool.filter((u) => (stacks.get(u.id) ?? 0) < u.maxStacks);
  const choices: UpgradeConfig[] = [];
  while (choices.length < count && available.length > 0) {
    let totalWeight = 0;
    for (const u of available) totalWeight += rarityWeights[u.rarity];
    let roll = rng.next() * totalWeight;
    let pickedIndex = available.length - 1;
    for (let i = 0; i < available.length; i++) {
      roll -= rarityWeights[available[i].rarity];
      if (roll <= 0) {
        pickedIndex = i;
        break;
      }
    }
    choices.push(available[pickedIndex]);
    available.splice(pickedIndex, 1);
  }
  return choices;
}
