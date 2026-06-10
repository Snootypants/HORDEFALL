import { describe, expect, test } from 'vitest';
import { generateWave } from '../src/sim/waves/waveGenerator';
import { ENEMIES, BOSS_ID } from '../src/config/enemies';
import { WAVE_EVENTS } from '../src/config/waves';
import { BALANCE } from '../src/config/balance';
import { Rng } from '../src/core/Rng';

const gen = (wave: number, seed = 1, opts: Partial<Parameters<typeof generateWave>[0]> = {}) =>
  generateWave({
    wave,
    rng: new Rng(seed),
    enemies: ENEMIES,
    events: WAVE_EVENTS,
    balance: BALANCE.waves,
    playerLevel: 1,
    performance: null,
    timeSurvivedSec: 0,
    weaponPower: 0,
    ...opts,
  });

describe('generateWave', () => {
  test('wave 1 produces a non-empty roster of valid enemies', () => {
    const w = gen(1);
    expect(w.entries.length).toBeGreaterThan(0);
    for (const e of w.entries) {
      expect(e.count).toBeGreaterThan(0);
      const cfg = ENEMIES.find((c) => c.id === e.enemyId)!;
      expect(cfg).toBeDefined();
      expect(cfg.minWave).toBeLessThanOrEqual(1);
    }
  });

  test('never spawns enemies before their minWave', () => {
    for (let wave = 1; wave <= 12; wave++) {
      const w = gen(wave, wave * 7);
      for (const e of w.entries) {
        if (e.enemyId === BOSS_ID) continue;
        const cfg = ENEMIES.find((c) => c.id === e.enemyId)!;
        expect(cfg.minWave).toBeLessThanOrEqual(wave);
      }
    }
  });

  test('every 5th wave is a boss wave containing the boss', () => {
    for (const wave of [5, 10, 15]) {
      const w = gen(wave);
      expect(w.isBoss).toBe(true);
      expect(w.eventId).toBe('boss');
      expect(w.entries.some((e) => e.enemyId === BOSS_ID)).toBe(true);
    }
    expect(gen(4).isBoss).toBe(false);
    expect(gen(6).isBoss).toBe(false);
  });

  test('budget grows with wave number', () => {
    const early = gen(2, 3);
    const late = gen(9, 3, { forcedEventId: 'normal' });
    expect(late.budget).toBeGreaterThan(early.budget);
  });

  test('deterministic for the same seed, varies across seeds', () => {
    const a = gen(3, 99);
    const b = gen(3, 99);
    expect(a).toEqual(b);
    const totals = new Set(
      [1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(gen(3, s).entries)),
    );
    expect(totals.size).toBeGreaterThan(1);
  });

  test('swarm event yields more bodies than a normal wave of the same budget era', () => {
    const swarm = gen(7, 11, { forcedEventId: 'swarm' });
    const normal = gen(7, 11, { forcedEventId: 'normal' });
    const count = (w: typeof swarm) => w.entries.reduce((n, e) => n + e.count, 0);
    expect(count(swarm)).toBeGreaterThan(count(normal));
  });

  test('elite event marks some entries elite', () => {
    const w = gen(8, 13, { forcedEventId: 'elite' });
    expect(w.entries.some((e) => e.elite)).toBe(true);
  });

  test('good prior performance raises the budget; poor performance lowers it', () => {
    const fast = gen(6, 21, {
      forcedEventId: 'normal',
      performance: { clearTimeSec: 15, damageTaken: 0 },
    });
    const slow = gen(6, 21, {
      forcedEventId: 'normal',
      performance: { clearTimeSec: 300, damageTaken: 200 },
    });
    expect(fast.budget).toBeGreaterThan(slow.budget);
  });

  test('player level nudges the budget upward', () => {
    const lowLevel = gen(6, 31, { forcedEventId: 'normal', playerLevel: 1 });
    const highLevel = gen(6, 31, { forcedEventId: 'normal', playerLevel: 12 });
    expect(highLevel.budget).toBeGreaterThan(lowLevel.budget);
  });

  test('fog and ammo-scarce events carry their modifiers', () => {
    const fog = gen(6, 17, { forcedEventId: 'fog' });
    expect(fog.fogDensityMult).toBeGreaterThan(1);
    const scarce = gen(7, 17, { forcedEventId: 'ammo-scarce' });
    expect(scarce.ammoDropMult).toBeLessThan(1);
  });
});
