/**
 * Adaptive drops: effective pickup weights respond to the player's current
 * needs (low ammo/armor/health boost their kinds; low armor nudges health),
 * clamped so drops never become absurd, and composing with wave modifiers.
 */

import { describe, expect, it } from 'vitest';
import { PICKUPS } from '../src/config/pickups';
import { BALANCE } from '../src/config/balance';
import { effectiveWeights, type ResourceNeeds } from '../src/sim/drops';

const FULL: ResourceNeeds = { healthFrac: 1, armorFrac: 1, ammoFrac: 1 };
const MAX_BOOST = BALANCE.economy.adaptiveDropMaxBoost;

function weightOf(weights: number[], id: string): number {
  const idx = PICKUPS.findIndex((p) => p.id === id);
  return weights[idx];
}

function baseOf(id: string): number {
  return PICKUPS.find((p) => p.id === id)!.weight;
}

describe('effectiveWeights', () => {
  it('full resources → base weights unchanged', () => {
    const w = effectiveWeights(PICKUPS, FULL, 1);
    PICKUPS.forEach((p, i) => expect(w[i]).toBeCloseTo(p.weight));
  });

  it('low ammo boosts ammo weight up to the max boost', () => {
    const w = effectiveWeights(PICKUPS, { ...FULL, ammoFrac: 0 }, 1);
    expect(weightOf(w, 'ammo-box')).toBeCloseTo(baseOf('ammo-box') * MAX_BOOST);
    expect(weightOf(w, 'health-small')).toBeCloseTo(baseOf('health-small'));
  });

  it('low health boosts health weights', () => {
    const w = effectiveWeights(PICKUPS, { ...FULL, healthFrac: 0 }, 1);
    expect(weightOf(w, 'health-small')).toBeCloseTo(baseOf('health-small') * MAX_BOOST);
    expect(weightOf(w, 'health-large')).toBeCloseTo(baseOf('health-large') * MAX_BOOST);
    expect(weightOf(w, 'ammo-box')).toBeCloseTo(baseOf('ammo-box'));
  });

  it('low armor boosts armor and nudges health a little', () => {
    const w = effectiveWeights(PICKUPS, { ...FULL, armorFrac: 0 }, 1);
    expect(weightOf(w, 'armor-shard')).toBeCloseTo(baseOf('armor-shard') * MAX_BOOST);
    const healthMult = weightOf(w, 'health-small') / baseOf('health-small');
    expect(healthMult).toBeGreaterThan(1);
    expect(healthMult).toBeLessThan(MAX_BOOST); // a nudge, not a full boost
  });

  it('combined low resources: every kind boosted, all clamped at max boost', () => {
    const w = effectiveWeights(PICKUPS, { healthFrac: 0, armorFrac: 0, ammoFrac: 0 }, 1);
    for (const p of PICKUPS) {
      if (p.weight === 0) continue; // reward-only entries never random-drop
      const mult = weightOf(w, p.id) / p.weight;
      expect(mult).toBeLessThanOrEqual(MAX_BOOST + 1e-9);
      expect(mult).toBeGreaterThanOrEqual(1);
    }
    // The weapon cache stays at zero weight even under maximum need.
    expect(weightOf(w, 'weapon-cache')).toBe(0);
    // health gets both its own boost and the armor nudge — still clamped
    expect(weightOf(w, 'health-small')).toBeCloseTo(baseOf('health-small') * MAX_BOOST);
  });

  it('clamps garbage fractions into the sane range', () => {
    const w = effectiveWeights(PICKUPS, { healthFrac: -5, armorFrac: 7, ammoFrac: NaN }, 1);
    for (const p of PICKUPS) {
      if (p.weight === 0) continue; // reward-only entries never random-drop
      const mult = weightOf(w, p.id) / p.weight;
      expect(Number.isFinite(mult)).toBe(true);
      expect(mult).toBeGreaterThanOrEqual(1);
      expect(mult).toBeLessThanOrEqual(MAX_BOOST + 1e-9);
    }
  });

  it('composes with the ammo-scarce wave modifier', () => {
    const w = effectiveWeights(PICKUPS, { ...FULL, ammoFrac: 0 }, 0.4);
    expect(weightOf(w, 'ammo-box')).toBeCloseTo(baseOf('ammo-box') * 0.4 * MAX_BOOST);
  });

  it('credits are never adaptive', () => {
    const w = effectiveWeights(PICKUPS, { healthFrac: 0, armorFrac: 0, ammoFrac: 0 }, 1);
    expect(weightOf(w, 'credits-small')).toBeCloseTo(baseOf('credits-small'));
    expect(weightOf(w, 'credits-large')).toBeCloseTo(baseOf('credits-large'));
  });
});
