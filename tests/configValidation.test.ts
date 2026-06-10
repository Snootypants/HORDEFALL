import { describe, expect, test } from 'vitest';
import { validateAllConfigs, validateConfigSet } from '../src/config/validation';
import { WEAPONS } from '../src/config/weapons';
import { ENEMIES } from '../src/config/enemies';
import { UPGRADES } from '../src/config/upgrades';
import { WAVE_EVENTS } from '../src/config/waves';
import { BALANCE } from '../src/config/balance';
import type { EnemyConfig, WeaponConfig } from '../src/config/types';

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

const baseSet = () => ({
  weapons: clone(WEAPONS),
  enemies: clone(ENEMIES),
  upgrades: clone(UPGRADES),
  waveEvents: clone(WAVE_EVENTS),
  balance: clone(BALANCE),
});

describe('config validation', () => {
  test('the shipped game configs are valid', () => {
    const report = validateAllConfigs();
    expect(report.errors).toEqual([]);
  });

  test('melee fallback with no upgrades is intended — no warning', () => {
    const report = validateAllConfigs();
    expect(report.warnings.some((w) => w.includes('machete') && w.includes('no upgrade path'))).toBe(false);
  });

  test('a GUN with no upgrade path still warns', () => {
    const set = baseSet();
    set.weapons.find((w) => w.id === 'pistol')!.upgrades = [];
    const report = validateConfigSet(set);
    expect(report.warnings.some((w) => w.includes('pistol') && w.includes('no upgrade path'))).toBe(true);
  });

  test('duplicate weapon ids are an error', () => {
    const set = baseSet();
    set.weapons.push(clone(set.weapons[0]));
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('duplicate') && e.includes(set.weapons[0].id))).toBe(true);
  });

  test('non-positive weapon damage is an error', () => {
    const set = baseSet();
    (set.weapons[0] as WeaponConfig).damage = 0;
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('damage'))).toBe(true);
  });

  test('duplicate weapon slots are an error', () => {
    const set = baseSet();
    set.weapons[1].slot = set.weapons[0].slot;
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('slot'))).toBe(true);
  });

  test('projectile weapons must define a projectile spec', () => {
    const set = baseSet();
    const launcher = set.weapons.find((w) => w.kind === 'projectile')!;
    delete (launcher as Partial<WeaponConfig>).projectile;
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('projectile'))).toBe(true);
  });

  test('enemy with zero hp is an error', () => {
    const set = baseSet();
    (set.enemies[0] as EnemyConfig).hp = 0;
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('hp'))).toBe(true);
  });

  test('boss summons must reference an existing enemy id', () => {
    const set = baseSet();
    const boss = set.enemies.find((e) => e.boss)!;
    boss.boss!.summons = 'does-not-exist';
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('summons'))).toBe(true);
  });

  test('at least one budget-pickable enemy must exist for wave 1', () => {
    const set = baseSet();
    for (const e of set.enemies) e.minWave = 99;
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('wave 1'))).toBe(true);
  });

  test('upgrade with neither mods nor grants is an error', () => {
    const set = baseSet();
    delete set.upgrades[0].mods;
    delete set.upgrades[0].grants;
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes(set.upgrades[0].id))).toBe(true);
  });

  test('upgrade maxStacks must be >= 1', () => {
    const set = baseSet();
    set.upgrades[0].maxStacks = 0;
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('maxStacks'))).toBe(true);
  });

  test('boss cadence must have a forced boss event available', () => {
    const set = baseSet();
    set.waveEvents = set.waveEvents.filter((w) => w.id !== 'boss');
    const report = validateConfigSet(set);
    expect(report.errors.some((e) => e.includes('boss'))).toBe(true);
  });

  test('report counts entries checked', () => {
    const report = validateAllConfigs();
    expect(report.checked.weapons).toBe(WEAPONS.length);
    expect(report.checked.enemies).toBe(ENEMIES.length);
    expect(report.checked.upgrades).toBe(UPGRADES.length);
  });
});
