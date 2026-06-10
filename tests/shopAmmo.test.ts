/**
 * Shop ammo edge cases: the Armory must never charge credits for a no-op
 * refill — not for the melee weapon (no reserve), not when every unlocked
 * gun is already full — and must refill a gun that actually needs ammo.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { buyShopItem } from '../src/game/shopActions';
import type { AudioManager } from '../src/audio/AudioManager';

const silentAudio = { play: () => {} } as unknown as AudioManager;

describe('shop ammo refill (P3)', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation({ mapConfig: MAPS[0], seed: 3, unlockedWeapons: ['pistol', 'shotgun'] });
    sim.startRun();
    sim.credits = 1000;
  });

  it('never targets the melee weapon for a refill', () => {
    sim.weapons.currentId = 'machete';
    expect(sim.weapons.ammoRefillTarget()?.kind).not.toBe('melee');
  });

  it('with melee equipped, buying ammo refills a gun that needs it', () => {
    sim.weapons.state('pistol').reserve = 0;
    sim.weapons.currentId = 'machete';
    const before = sim.credits;
    expect(buyShopItem(sim, silentAudio, 'ammo')).toBe(true);
    expect(sim.credits).toBeLessThan(before);
    expect(sim.weapons.state('pistol').reserve).toBeGreaterThan(0);
  });

  function fillAllReserves(): void {
    for (const w of sim.weapons.weapons) sim.weapons.refillWeapon(w.id);
  }

  it('refuses the purchase (no charge) when every unlocked gun is full', () => {
    fillAllReserves();
    const before = sim.credits;
    expect(sim.weapons.ammoRefillTarget()).toBeNull();
    expect(buyShopItem(sim, silentAudio, 'ammo')).toBe(false);
    expect(sim.credits).toBe(before);
  });

  it('current gun full but another gun empty → the needy gun is refilled', () => {
    fillAllReserves();
    expect(sim.weapons.currentId).toBe('pistol'); // full reserve
    sim.weapons.state('shotgun').reserve = 0;
    expect(buyShopItem(sim, silentAudio, 'ammo')).toBe(true);
    expect(sim.weapons.state('shotgun').reserve).toBeGreaterThan(0);
  });

  it('prefers the current gun when it needs ammo', () => {
    sim.weapons.state('pistol').reserve = 1;
    sim.weapons.state('shotgun').reserve = 0;
    expect(sim.weapons.ammoRefillTarget()?.id).toBe('pistol');
  });
});
