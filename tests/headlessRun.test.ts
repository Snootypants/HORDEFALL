/**
 * Headless wave-system proofs (no renderer, DOM, or audio):
 *
 * 1. A 10-wave HARNESS run: real Simulation with real spawning/AI/combat/
 *    drops/progression/persistence and aimed scripted-input kills — but
 *    waves are force-cleared via killAll a few seconds after going active
 *    and breaks are skipped. This is NOT an organic playthrough; the
 *    force-clears keep 10 waves fast and deterministic while still
 *    exercising every system (wave generation, boss flow, rewards, drops,
 *    end-of-run save). Organic combat is proven separately below.
 *
 * 2. An ORGANIC single-wave clear: every wave-1 enemy dies to aimed weapon
 *    fire through the real combat path — no force-kills, no fallbacks.
 */

import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { SaveManager, defaultSaveData, type StorageLike } from '../src/save/SaveManager';
import { persistRunResults } from '../src/game/persistRun';
import { driveRun, driveOrganicWave } from './helpers/simHarness';

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}

describe('headless 10-wave harness run (force-cleared waves)', () => {
  it('drives 10 waves through every sim system, then persists the run', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 20260610 });
    sim.startRun();

    const kills: string[] = [];
    sim.bus.on('enemy:died', (e) => { if (e.killedByPlayer) kills.push(e.enemyId); });

    const result = driveRun(sim, 10);

    // The run progressed through 10 waves (harness-cleared, see header).
    expect(result.wavesCleared).toBeGreaterThanOrEqual(10);
    expect(sim.waves.wave).toBeGreaterThanOrEqual(10);
    expect(sim.time).toBeGreaterThan(30);

    // Real weapon-path combat happened alongside the force-clears
    // (combat/onHit → recordKill); kills[] also counts force-clear kills,
    // so it is a superset of stats.kills.
    expect(sim.stats.kills).toBeGreaterThan(20);
    expect(kills.length).toBeGreaterThanOrEqual(sim.stats.kills);
    expect(sim.stats.shotsFired).toBeGreaterThan(50);
    expect(sim.stats.shotsHit).toBeGreaterThan(20);
    expect(sim.progression.score).toBeGreaterThan(0);
    expect(sim.progression.level).toBeGreaterThan(1);
    expect(sim.credits).toBeGreaterThanOrEqual(0);
    expect(sim.stats.creditsEarned).toBeGreaterThan(0);

    // Waves 5 and 10 are boss waves; both bosses died.
    expect(sim.stats.bossKills).toBeGreaterThanOrEqual(2);

    // End-of-run persistence works headlessly (in-memory storage).
    const storage = new MemoryStorage();
    const saveManager = new SaveManager(storage);
    const data = defaultSaveData();
    persistRunResults(sim, data);
    saveManager.save(data);
    const reloaded = new SaveManager(storage).load();
    expect(reloaded.profile.totalRuns).toBe(1);
    expect(reloaded.profile.totalKills).toBe(sim.stats.kills);
    expect(reloaded.bestWave).toBe(sim.stats.wavesSurvived);
    expect(reloaded.runHistory).toHaveLength(1);
    expect(reloaded.runHistory[0].seed).toBe(20260610);
  });
});

describe('headless organic wave clear (no force-kills)', () => {
  it('clears wave 1 entirely through aimed weapon fire', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 808 });
    sim.startRun();
    let forced = 0;
    const origKillAll = sim.enemies.killAll.bind(sim.enemies);
    sim.enemies.killAll = ((...args: Parameters<typeof origKillAll>) => {
      forced++;
      return origKillAll(...args);
    }) as typeof origKillAll;

    const result = driveOrganicWave(sim);

    expect(result.cleared).toBe(true);
    expect(forced).toBe(0); // nothing was force-killed
    expect(sim.stats.kills).toBeGreaterThan(5); // every kill via weapons
    expect(sim.stats.shotsHit).toBeGreaterThan(5);
    expect(sim.waves.wave).toBe(1);
  });
});
