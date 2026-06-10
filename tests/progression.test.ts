import { describe, expect, test } from 'vitest';
import { xpForLevel, Progression } from '../src/sim/progression/Progression';
import { computePlayerStats, rollUpgradeChoices } from '../src/sim/progression/upgradeEffects';
import { UPGRADES } from '../src/config/upgrades';
import { BALANCE } from '../src/config/balance';
import { Rng } from '../src/core/Rng';

const prog = BALANCE.progression;

describe('xpForLevel', () => {
  test('level 1 requirement equals base and grows geometrically', () => {
    expect(xpForLevel(1, prog)).toBe(prog.xpBase);
    // requirements are rounded to whole XP
    expect(xpForLevel(3, prog)).toBe(Math.round(prog.xpBase * prog.xpGrowth * prog.xpGrowth));
  });
});

describe('Progression', () => {
  test('accumulating enough xp levels up and carries remainder', () => {
    const p = new Progression(prog);
    p.addXp(prog.xpBase + 10);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(10);
    expect(p.pendingLevelUps).toBe(1);
  });

  test('one large xp grant can produce multiple level-ups', () => {
    const p = new Progression(prog);
    p.addXp(xpForLevel(1, prog) + xpForLevel(2, prog) + 5);
    expect(p.level).toBe(3);
    expect(p.pendingLevelUps).toBe(2);
  });

  test('combo multiplier rises with rapid kills and decays after the window', () => {
    const p = new Progression(prog);
    p.registerKill(10.0);
    p.registerKill(10.5);
    p.registerKill(11.0);
    expect(p.comboMult).toBeCloseTo(1 + 2 * prog.comboPerKill);
    p.tickCombo(11.0 + prog.comboWindow + 0.1);
    expect(p.comboMult).toBe(1);
  });

  test('combo multiplier caps at comboMaxMult', () => {
    const p = new Progression(prog);
    for (let i = 0; i < 200; i++) p.registerKill(10 + i * 0.01);
    expect(p.comboMult).toBe(prog.comboMaxMult);
  });

  test('score is multiplied by the active combo', () => {
    const p = new Progression(prog);
    p.registerKill(1.0);
    p.registerKill(1.1); // mult now 1 + comboPerKill
    const gained = p.addScore(100);
    expect(gained).toBe(Math.round(100 * p.comboMult));
    expect(p.score).toBeGreaterThanOrEqual(100);
  });

  test('kill streak thresholds emit once each', () => {
    const p = new Progression(prog);
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      const s = p.registerKill(1 + i * 0.05);
      if (s) seen.push(s);
    }
    expect(seen).toEqual([5, 10]);
  });
});

describe('computePlayerStats', () => {
  test('no upgrades returns base stats and no flags', () => {
    const { stats, flags } = computePlayerStats(BALANCE.player, new Map(), UPGRADES);
    expect(stats.maxHealth).toBe(BALANCE.player.maxHealth);
    expect(stats.damageMult).toBe(1);
    expect(flags.size).toBe(0);
  });

  test('additive mods stack linearly with stack count', () => {
    const stacks = new Map([['juggernaut', 3]]);
    const { stats } = computePlayerStats(BALANCE.player, stacks, UPGRADES);
    expect(stats.maxHealth).toBe(BALANCE.player.maxHealth + 75);
  });

  test('multiplicative mods compound per stack', () => {
    const stacks = new Map([['quickhands', 2]]);
    const { stats } = computePlayerStats(BALANCE.player, stacks, UPGRADES);
    expect(stats.reloadSpeedMult).toBeCloseTo(1.15 * 1.15);
  });

  test('ability flags are granted', () => {
    const stacks = new Map([['explosive-rounds', 1], ['drone', 2]]);
    const { flags, droneCount } = computePlayerStats(BALANCE.player, stacks, UPGRADES);
    expect(flags.has('explosiveRounds')).toBe(true);
    expect(flags.has('drone')).toBe(true);
    expect(droneCount).toBe(2);
  });

  test('stacks beyond maxStacks are clamped', () => {
    const stacks = new Map([['juggernaut', 99]]);
    const { stats } = computePlayerStats(BALANCE.player, stacks, UPGRADES);
    expect(stats.maxHealth).toBe(BALANCE.player.maxHealth + 25 * 5);
  });
});

describe('rollUpgradeChoices', () => {
  test('returns the requested number of distinct upgrades', () => {
    const rng = new Rng(5);
    const choices = rollUpgradeChoices(rng, UPGRADES, new Map(), 3, prog.rarityWeights);
    expect(choices.length).toBe(3);
    expect(new Set(choices.map((c) => c.id)).size).toBe(3);
  });

  test('excludes upgrades already at max stacks', () => {
    const rng = new Rng(5);
    const stacks = new Map(UPGRADES.filter((u) => u.id !== 'juggernaut').map((u) => [u.id, u.maxStacks]));
    const choices = rollUpgradeChoices(rng, UPGRADES, stacks, 3, prog.rarityWeights);
    expect(choices.length).toBe(1);
    expect(choices[0].id).toBe('juggernaut');
  });

  test('is deterministic for the same rng seed', () => {
    const a = rollUpgradeChoices(new Rng(42), UPGRADES, new Map(), 3, prog.rarityWeights);
    const b = rollUpgradeChoices(new Rng(42), UPGRADES, new Map(), 3, prog.rarityWeights);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});
