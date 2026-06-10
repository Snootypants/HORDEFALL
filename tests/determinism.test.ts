/**
 * Determinism: same seed + same input command stream must produce the same
 * final simulation checksum. This is the contract that makes daily seeds,
 * replays, and an authoritative server possible.
 */

import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
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
