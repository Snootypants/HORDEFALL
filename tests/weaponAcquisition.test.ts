/**
 * Weapon acquisition pacing (Stage 2 P2): weapon caches drop as wave-clear
 * rewards on configured waves, unlock the cheapest still-locked gun on
 * collection, persist through the normal profile path, and guarantee a
 * non-default gun by wave 3 in a normal run. Caches never random-drop.
 */

import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { PICKUPS } from '../src/config/pickups';
import { WEAPONS } from '../src/config/weapons';
import { BALANCE } from '../src/config/balance';
import { persistRunResults } from '../src/game/persistRun';
import { defaultSaveData } from '../src/save/SaveManager';
import { neutralInput } from '../src/sim/inputCommand';
import { driveRun } from './helpers/simHarness';

describe('weapon caches (P2)', () => {
  it('config: cache exists, never random-drops, and waves are configured', () => {
    const cache = PICKUPS.find((p) => p.kind === 'weapon');
    expect(cache).toBeDefined();
    expect(cache!.weight).toBe(0); // wave reward only — never a random drop
    expect(BALANCE.economy.weaponCacheWaves).toContain(2); // first gun BY wave 3
  });

  it('clearing a cache wave spawns a cache and the run unlocks a gun', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 77 });
    sim.startRun();
    let spawned = 0;
    let unlockedId = '';
    sim.bus.on('weapon:cache-spawned', () => spawned++);
    sim.bus.on('weapon:cache-unlocked', (e) => { unlockedId = e.weaponId; });
    driveRun(sim, 2);
    // driveRun returns at the clearing tick; give the magnet a few break
    // seconds to deliver the cache to the (now idle) player.
    for (let t = 0; t < 240; t++) sim.tick(1 / 60, neutralInput());
    expect(spawned).toBeGreaterThanOrEqual(1);
    expect(unlockedId).not.toBe('');
    expect(sim.weapons.runtime.get(unlockedId)!.unlocked).toBe(true);
  });

  it('cache unlock persists through the normal profile path', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 78 });
    sim.startRun();
    let unlockedId = '';
    sim.bus.on('weapon:cache-unlocked', (e) => { unlockedId = e.weaponId; });
    driveRun(sim, 3);
    expect(unlockedId).not.toBe('');
    const data = defaultSaveData();
    persistRunResults(sim, data);
    expect(data.unlocks.weapons).toContain(unlockedId);
  });

  it('a normal default-loadout run owns a non-default gun by wave 3', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 79 });
    sim.startRun();
    driveRun(sim, 3);
    const owned = WEAPONS.filter(
      (w) => w.kind !== 'melee' && !w.unlockedByDefault && sim.weapons.runtime.get(w.id)!.unlocked,
    );
    expect(owned.length).toBeGreaterThanOrEqual(1);
  });

  it('no cache spawns when every gun is already unlocked', () => {
    const sim = new Simulation({
      mapConfig: MAPS[0], seed: 80,
      unlockedWeapons: WEAPONS.map((w) => w.id),
    });
    sim.startRun();
    let spawned = 0;
    sim.bus.on('weapon:cache-spawned', () => spawned++);
    driveRun(sim, 2);
    expect(spawned).toBe(0);
  });

  it('unlocks go cheapest-first and never pick melee', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 81 });
    sim.startRun();
    const ids: string[] = [];
    sim.bus.on('weapon:cache-unlocked', (e) => ids.push(e.weaponId));
    driveRun(sim, Math.max(...BALANCE.economy.weaponCacheWaves) + 1);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const costs = ids.map((id) => WEAPONS.find((w) => w.id === id)!.unlockCost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs); // ascending cost
    for (const id of ids) expect(WEAPONS.find((w) => w.id === id)!.kind).not.toBe('melee');
  });
});
