/**
 * Adaptive drop weighting: the base weighted-pickup roll stays, but each
 * kind's effective weight scales with how badly the player needs it. Pure
 * functions — the tuning console reuses them for its live odds readout.
 */

import type { PickupConfig } from '../config/types';
import { BALANCE } from '../config/balance';
import { clamp, clamp01 } from '../core/math';

export interface ResourceNeeds {
  healthFrac: number;
  armorFrac: number;
  ammoFrac: number;
}

/** need 0 → ×1, need 1 → ×maxBoost (linear in between). */
function needMult(frac: number, maxBoost: number): number {
  const f = Number.isFinite(frac) ? clamp01(frac) : 1;
  return 1 + (1 - f) * (maxBoost - 1);
}

/**
 * Effective weight per pickup config (parallel array). Composes, in order:
 * base weight × wave ammo modifier × adaptive need multiplier (clamped).
 * Credits never adapt. Low armor adds a small health nudge on top of
 * health's own need — the sum is clamped to maxBoost.
 */
export function effectiveWeights(
  configs: PickupConfig[],
  needs: ResourceNeeds,
  ammoDropMult: number,
  weightMults?: Record<string, number>,
): number[] {
  const eco = BALANCE.economy;
  const maxBoost = eco.adaptiveDropMaxBoost;
  const armorNeed = 1 - (Number.isFinite(needs.armorFrac) ? clamp01(needs.armorFrac) : 1);

  return configs.map((c) => {
    let weight = c.weight * (weightMults?.[c.id] ?? 1);
    let mult = 1;
    switch (c.kind) {
      case 'ammo':
        weight *= ammoDropMult;
        mult = needMult(needs.ammoFrac, maxBoost);
        break;
      case 'armor':
        mult = needMult(needs.armorFrac, maxBoost);
        break;
      case 'health':
        mult = needMult(needs.healthFrac, maxBoost) + armorNeed * eco.lowArmorHealthBoost;
        break;
      case 'credits':
        break;
    }
    return weight * clamp(mult, 1, maxBoost);
  });
}

/** Normalized odds (0..1 per config) for debug/tuning readouts. */
export function effectiveDropOdds(
  configs: PickupConfig[],
  needs: ResourceNeeds,
  ammoDropMult: number,
  weightMults?: Record<string, number>,
): { id: string; weight: number; odds: number }[] {
  const weights = effectiveWeights(configs, needs, ammoDropMult, weightMults);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return configs.map((c, i) => ({ id: c.id, weight: weights[i], odds: weights[i] / total }));
}
