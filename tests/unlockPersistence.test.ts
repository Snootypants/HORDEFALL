/**
 * Unlock provenance: shop unlocks persist to the profile; tuning/dev unlocks
 * are session-only cheats; tuning locks never erase saved unlocks; and the
 * tuning UI can never strand the player with zero usable weapons.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { WEAPONS } from '../src/config/weapons';
import { persistRunResults } from '../src/game/persistRun';
import { runDevAction } from '../src/game/devActions';
import { buyShopItem } from '../src/game/shopActions';
import { defaultSaveData } from '../src/save/SaveManager';
import type { AudioManager } from '../src/audio/AudioManager';

const silentAudio = { play: () => {} } as unknown as AudioManager;

describe('unlock persistence (P2)', () => {
  let sim: Simulation;

  beforeEach(() => {
    // Player profile owns pistol + shotgun.
    sim = new Simulation({ mapConfig: MAPS[0], seed: 1, unlockedWeapons: ['pistol', 'shotgun'] });
    sim.startRun();
  });

  it('a dev unlock-all does not persist into profile unlocks', () => {
    runDevAction(sim, { kind: 'unlockall' });
    expect(sim.weapons.runtime.get('sniper')!.unlocked).toBe(true); // cheat works in-session
    const data = defaultSaveData();
    persistRunResults(sim, data);
    expect(data.unlocks.weapons).not.toContain('sniper');
    expect(data.unlocks.weapons).toContain('shotgun'); // real unlock kept
  });

  it('a tuning-panel unlock does not persist', () => {
    sim.weapons.setUnlocked('rifle', true);
    expect(sim.weapons.runtime.get('rifle')!.unlocked).toBe(true);
    const data = defaultSaveData();
    persistRunResults(sim, data);
    expect(data.unlocks.weapons).not.toContain('rifle');
  });

  it('a tuning-panel lock does not remove an existing saved unlock', () => {
    sim.weapons.setUnlocked('shotgun', false);
    expect(sim.weapons.runtime.get('shotgun')!.unlocked).toBe(false);
    const data = defaultSaveData();
    persistRunResults(sim, data);
    expect(data.unlocks.weapons).toContain('shotgun');
  });

  it('a normal shop unlock still persists', () => {
    sim.credits = 10_000;
    const ok = buyShopItem(sim, silentAudio, 'unlock:rifle');
    expect(ok).toBe(true);
    const data = defaultSaveData();
    persistRunResults(sim, data);
    expect(data.unlocks.weapons).toContain('rifle');
  });
});

describe('no-weapon-state guards (P4)', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation({ mapConfig: MAPS[0], seed: 2 });
    sim.startRun();
  });

  it('the melee fallback cannot be locked', () => {
    const melee = WEAPONS.find((w) => w.kind === 'melee')!;
    expect(sim.weapons.setUnlocked(melee.id, false)).toBe(false);
    expect(sim.weapons.runtime.get(melee.id)!.unlocked).toBe(true);
  });

  it('locking the current weapon switches to a valid fallback with an event', () => {
    expect(sim.weapons.currentId).toBe('pistol');
    let switched = '';
    sim.bus.on('weapon:switched', (e) => { switched = e.weaponId; });
    expect(sim.weapons.setUnlocked('pistol', false)).toBe(true);
    expect(sim.weapons.currentId).not.toBe('pistol');
    expect(sim.weapons.runtime.get(sim.weapons.currentId)!.unlocked).toBe(true);
    expect(switched).toBe(sim.weapons.currentId);
  });

  it('can never reach zero usable weapons', () => {
    // Try to lock everything; the API must keep at least one weapon usable.
    for (const w of WEAPONS) sim.weapons.setUnlocked(w.id, false);
    const usable = WEAPONS.filter((w) => sim.weapons.runtime.get(w.id)!.unlocked);
    expect(usable.length).toBeGreaterThanOrEqual(1);
    expect(sim.weapons.runtime.get(sim.weapons.currentId)!.unlocked).toBe(true);
  });
});
