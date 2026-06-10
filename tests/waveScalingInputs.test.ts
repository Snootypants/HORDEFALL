/**
 * Wave scaling must consider time survived (run pace) and weapon upgrade
 * power, in addition to wave number / player level / prior performance.
 */

import { describe, expect, it } from 'vitest';
import { generateWave, type GenerateWaveOptions } from '../src/sim/waves/waveGenerator';
import { WeaponSim } from '../src/sim/weapons';
import { WEAPONS } from '../src/config/weapons';
import { ENEMIES } from '../src/config/enemies';
import { WAVE_EVENTS } from '../src/config/waves';
import { BALANCE } from '../src/config/balance';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import type { GameEvents } from '../src/sim/events';

function opts(overrides: Partial<GenerateWaveOptions> = {}): GenerateWaveOptions {
  return {
    wave: 4,
    rng: new Rng(42),
    enemies: ENEMIES,
    events: WAVE_EVENTS,
    balance: BALANCE.waves,
    playerLevel: 3,
    performance: null,
    timeSurvivedSec: 0,
    weaponPower: 0,
    forcedEventId: 'normal',
    ...overrides,
  };
}

describe('weapon power budget input', () => {
  it('larger weapon power yields a larger budget', () => {
    const weak = generateWave(opts({ weaponPower: 0 }));
    const strong = generateWave(opts({ weaponPower: 10 }));
    expect(strong.budget).toBeGreaterThan(weak.budget);
  });

  it('weapon power 0 is neutral (matches a config with factor 0)', () => {
    const neutral = generateWave(opts({ weaponPower: 0 }));
    const zeroFactor = generateWave(opts({
      weaponPower: 0,
      balance: { ...BALANCE.waves, weaponPowerBudgetFactor: 0 },
    }));
    expect(neutral.budget).toBe(zeroFactor.budget);
  });
});

describe('time survived (pace) budget input', () => {
  it('a fast pace yields a larger budget than a slow pace', () => {
    // Wave 6 after 100s = blazing; after 600s = slow.
    const fast = generateWave(opts({ wave: 6, timeSurvivedSec: 100 }));
    const slow = generateWave(opts({ wave: 6, timeSurvivedSec: 600 }));
    expect(fast.budget).toBeGreaterThan(slow.budget);
  });

  it('pace multiplier is clamped to the configured range', () => {
    const base = generateWave(opts({ wave: 6, timeSurvivedSec: 0, balance: { ...BALANCE.waves, paceBudgetMin: 1, paceBudgetMax: 1 } }));
    const absurdFast = generateWave(opts({ wave: 6, timeSurvivedSec: 1 }));
    const absurdSlow = generateWave(opts({ wave: 6, timeSurvivedSec: 100_000 }));
    expect(absurdFast.budget).toBeLessThanOrEqual(Math.ceil(base.budget * BALANCE.waves.paceBudgetMax));
    expect(absurdSlow.budget).toBeGreaterThanOrEqual(Math.floor(base.budget * BALANCE.waves.paceBudgetMin));
  });

  it('wave 1 ignores pace (no completed waves to measure)', () => {
    const a = generateWave(opts({ wave: 1, timeSurvivedSec: 0 }));
    const b = generateWave(opts({ wave: 1, timeSurvivedSec: 500 }));
    expect(a.budget).toBe(b.budget);
  });
});

describe('determinism with new inputs', () => {
  it('identical inputs produce identical waves', () => {
    const a = generateWave(opts({ wave: 7, timeSurvivedSec: 300, weaponPower: 4 }));
    const b = generateWave(opts({ wave: 7, timeSurvivedSec: 300, weaponPower: 4 }));
    expect(a).toEqual(b);
  });
});

describe('WeaponSim.powerScore', () => {
  function makeWeapons(unlocked: string[] = []): WeaponSim {
    return new WeaponSim(WEAPONS, unlocked, new EventBus<GameEvents>(), new Rng(1));
  }

  it('is 0 for the stock loadout', () => {
    expect(makeWeapons().powerScore()).toBe(0);
  });

  it('adds 1 per non-default unlock', () => {
    const w = makeWeapons();
    const locked = WEAPONS.find((cfg) => !cfg.unlockedByDefault)!;
    w.unlock(locked.id);
    expect(w.powerScore()).toBe(1);
  });

  it('adds 0.5 per purchased tier', () => {
    const w = makeWeapons();
    const stock = WEAPONS.find((cfg) => cfg.unlockedByDefault && cfg.upgrades.length > 0)!;
    w.buyUpgradeTier(stock.id);
    expect(w.powerScore()).toBe(0.5);
    w.buyUpgradeTier(stock.id);
    expect(w.powerScore()).toBe(1);
  });
});
