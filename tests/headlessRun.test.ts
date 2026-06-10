/**
 * Proof that a REAL multi-wave run executes headlessly: 10 waves of the
 * actual Simulation in Node — spawning, AI, combat, drops, progression,
 * boss waves, and end-of-run persistence — with no renderer, DOM, or audio.
 */

import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { SaveManager, defaultSaveData, type StorageLike } from '../src/save/SaveManager';
import { persistRunResults } from '../src/game/persistRun';
import { driveRun } from './helpers/simHarness';

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}

describe('headless 10-wave run', () => {
  it('plays 10 real waves: spawns, combat, rewards, boss, persistence', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 20260610 });
    sim.startRun();

    const kills: string[] = [];
    sim.bus.on('enemy:died', (e) => { if (e.killedByPlayer) kills.push(e.enemyId); });

    const result = driveRun(sim, 10);

    // The run truly progressed through 10 waves.
    expect(result.wavesCleared).toBeGreaterThanOrEqual(10);
    expect(sim.waves.wave).toBeGreaterThanOrEqual(10);
    expect(sim.time).toBeGreaterThan(30);

    // Real combat happened: weapon-path kills (combat/onHit → recordKill),
    // not just the wave-clear fallback. kills[] also counts fallback kills,
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
