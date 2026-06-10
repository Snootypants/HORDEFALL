/**
 * Determinism: same seed + same input command stream must produce the same
 * final simulation checksum. This is the contract that makes daily seeds,
 * replays, and an authoritative server possible.
 */

import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { WEAPONS } from '../src/config/weapons';
import { PICKUPS } from '../src/config/pickups';
import { neutralInput } from '../src/sim/inputCommand';
import { driveRun, simChecksum } from './helpers/simHarness';

function runOnce(seed: number, waves: number): { checksum: string; wavesCleared: number } {
  const sim = new Simulation({ mapConfig: MAPS[0], seed });
  sim.startRun();
  const result = driveRun(sim, waves);
  return { checksum: simChecksum(sim), wavesCleared: result.wavesCleared };
}

describe('simulation determinism', () => {
  it('same seed + same command stream → identical final checksum', () => {
    const a = runOnce(424242, 4);
    const b = runOnce(424242, 4);
    expect(a.wavesCleared).toBeGreaterThanOrEqual(4);
    expect(a.checksum).toBe(b.checksum);
    expect(a.wavesCleared).toBe(b.wavesCleared);
  });

  it('checksum is sensitive: a different seed diverges', () => {
    const a = runOnce(424242, 2);
    const b = runOnce(424243, 2);
    expect(a.checksum).not.toBe(b.checksum);
  });

  it('checksum is sensitive to a NON-current weapon runtime change', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 11, unlockedWeapons: ['shotgun'] });
    sim.startRun();
    const before = simChecksum(sim);
    expect(sim.weapons.currentId).toBe('pistol');
    sim.weapons.state('shotgun').reserve -= 1; // not the held weapon
    expect(simChecksum(sim)).not.toBe(before);
  });

  it('checksum is sensitive to pickup, projectile, and barrel state', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 12 });
    sim.startRun();

    const a = simChecksum(sim);
    sim.pickups.spawn(PICKUPS[0], 3, 3);
    const b = simChecksum(sim);
    expect(b).not.toBe(a);

    const launcher = WEAPONS.find((w) => w.id === 'launcher')!;
    sim.playerProjectiles.spawn(launcher, 0, 1, 0, 0, 0, -1, 50);
    const c = simChecksum(sim);
    expect(c).not.toBe(b);

    expect(sim.barrels.count).toBeGreaterThan(0);
    sim.barrels.hp[0] -= 5;
    expect(simChecksum(sim)).not.toBe(c);
  });

  it('checksum is sensitive: a longer command stream diverges', () => {
    const mk = (): Simulation => {
      const sim = new Simulation({ mapConfig: MAPS[0], seed: 99 });
      sim.startRun();
      return sim;
    };
    const a = mk();
    driveRun(a, 1);
    const b = mk();
    driveRun(b, 1);
    expect(simChecksum(a)).toBe(simChecksum(b)); // baseline: identical so far
    b.tick(1 / 60, neutralInput()); // one extra tick of input
    expect(simChecksum(a)).not.toBe(simChecksum(b));
  });
});
