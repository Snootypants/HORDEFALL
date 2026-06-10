/**
 * Live tuning overrides: a validated layer over shipped config — weapon
 * damage, enemy hp/speed/damage, drop chance, pickup weights, tier disables.
 * Overrides never mutate source config objects and never touch save data.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultTuning,
  validateTuning,
  parseTuningJson,
  serializeTuning,
  type TuningOverrides,
} from '../src/sim/tuning';
import { WeaponSim } from '../src/sim/weapons';
import { WEAPONS, weaponById } from '../src/config/weapons';
import { ENEMIES, enemyById } from '../src/config/enemies';
import { UPGRADES } from '../src/config/upgrades';
import { BALANCE } from '../src/config/balance';
import { PICKUPS } from '../src/config/pickups';
import { scaleEnemy } from '../src/sim/enemies/scaling';
import { effectiveWeights } from '../src/sim/drops';
import { computePlayerStats } from '../src/sim/progression/upgradeEffects';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { RunStats } from '../src/sim/RunStats';
import type { GameEvents } from '../src/sim/events';
import type { CombatContext } from '../src/sim/combat/context';

describe('validateTuning', () => {
  it('accepts defaults with no errors', () => {
    const { errors } = validateTuning(defaultTuning());
    expect(errors).toHaveLength(0);
  });

  it('rejects garbage values and falls back per-field', () => {
    const raw = {
      ...defaultTuning(),
      weaponDamageMult: { pistol: NaN, rifle: -2, shotgun: 2 },
      dropChance: 7,
    };
    const { value, errors } = validateTuning(raw);
    expect(errors.length).toBeGreaterThan(0);
    expect(value.weaponDamageMult.pistol).toBeUndefined();
    expect(value.weaponDamageMult.rifle).toBeUndefined();
    expect(value.weaponDamageMult.shotgun).toBe(2);
    expect(value.dropChance).toBeNull();
  });

  it('rejects non-object payloads entirely', () => {
    expect(validateTuning('nope').errors.length).toBeGreaterThan(0);
    expect(validateTuning(null).errors.length).toBeGreaterThan(0);
  });

  it('JSON roundtrip preserves a valid preset', () => {
    const t = defaultTuning();
    t.weaponDamageMult.pistol = 1.5;
    t.enemyHpMult.rusher = 0.5;
    t.dropChance = 0.9;
    t.disabledTiers.pistol = [1];
    const back = parseTuningJson(serializeTuning(t));
    expect(back.errors).toHaveLength(0);
    expect(back.value).toEqual(t);
  });

  it('parseTuningJson survives invalid JSON', () => {
    const { errors } = parseTuningJson('{not json');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('tuning application', () => {
  let ctx: CombatContext;

  beforeEach(() => {
    const playerStats = computePlayerStats(BALANCE.player, new Map(), UPGRADES);
    ctx = {
      enemies: { } as never,
      barrels: {} as never,
      collision: {} as never,
      bus: new EventBus<GameEvents>(),
      rng: new Rng(2),
      stats: new RunStats(),
      player: () => playerStats,
      healPlayer: () => {},
      playerPos: { x: 0, z: 0 },
      damagePlayer: () => {},
    };
  });

  it('weapon damage multiplier applies live in effective()', () => {
    const tuning = defaultTuning();
    const weapons = new WeaponSim(WEAPONS, [], new EventBus<GameEvents>(), new Rng(1), tuning);
    const base = weapons.effective(ctx, weaponById('pistol')!).damage;
    tuning.weaponDamageMult.pistol = 2;
    expect(weapons.effective(ctx, weaponById('pistol')!).damage).toBeCloseTo(base * 2);
  });

  it('disabled upgrade tiers stop contributing', () => {
    const tuning = defaultTuning();
    const weapons = new WeaponSim(WEAPONS, [], new EventBus<GameEvents>(), new Rng(1), tuning);
    const pistol = weaponById('pistol')!;
    weapons.state('pistol').mag = pistol.magSize;
    weapons.runtime.get('pistol')!.tier = 1; // owns tier 1: +20% dmg
    const boosted = weapons.effective(ctx, pistol).damage;
    tuning.disabledTiers.pistol = [0];
    const disabled = weapons.effective(ctx, pistol).damage;
    expect(disabled).toBeLessThan(boosted);
    expect(disabled).toBeCloseTo(pistol.damage);
  });

  it('enemy hp/speed/damage multipliers shape future spawns', () => {
    const rusher = enemyById('rusher')!;
    const base = scaleEnemy(rusher, 3, BALANCE.enemyScaling, false);
    const tuning = defaultTuning();
    tuning.enemyHpMult.rusher = 2;
    tuning.enemySpeedMult.rusher = 0.5;
    tuning.enemyDamageMult.rusher = 3;
    const tuned = scaleEnemy(rusher, 3, BALANCE.enemyScaling, false, tuning);
    expect(tuned.hp).toBeCloseTo(base.hp * 2);
    expect(tuned.speed).toBeCloseTo(base.speed * 0.5);
    expect(tuned.damage).toBeCloseTo(base.damage * 3);
  });

  it('pickup weight multipliers reshape drop odds', () => {
    const needs = { healthFrac: 1, armorFrac: 1, ammoFrac: 1 };
    const base = effectiveWeights(PICKUPS, needs, 1);
    const mults = { 'ammo-box': 4 };
    const tuned = effectiveWeights(PICKUPS, needs, 1, mults);
    const ammoIdx = PICKUPS.findIndex((p) => p.id === 'ammo-box');
    expect(tuned[ammoIdx]).toBeCloseTo(base[ammoIdx] * 4);
  });

  it('a Simulation built with tuning applies it end-to-end', () => {
    const tuning = defaultTuning();
    tuning.enemyHpMult.rusher = 10;
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 7, tuning });
    sim.startRun();
    const idx = sim.debugSpawnEnemy('rusher', 5, 5);
    const plain = new Simulation({ mapConfig: MAPS[0], seed: 7 });
    plain.startRun();
    const plainIdx = plain.debugSpawnEnemy('rusher', 5, 5);
    expect(sim.enemies.maxHp[idx]).toBeCloseTo(plain.enemies.maxHp[plainIdx] * 10);
  });

  it('tuning never mutates the shipped configs', () => {
    const pistolDamage = weaponById('pistol')!.damage;
    const rusherHp = enemyById('rusher')!.hp;
    const tuning: TuningOverrides = defaultTuning();
    tuning.weaponDamageMult.pistol = 5;
    tuning.enemyHpMult.rusher = 5;
    const weapons = new WeaponSim(WEAPONS, [], new EventBus<GameEvents>(), new Rng(1), tuning);
    weapons.effective(ctx, weaponById('pistol')!);
    scaleEnemy(enemyById('rusher')!, 2, BALANCE.enemyScaling, false, tuning);
    expect(weaponById('pistol')!.damage).toBe(pistolDamage);
    expect(enemyById('rusher')!.hp).toBe(rusherHp);
  });
});
