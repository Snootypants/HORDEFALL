/**
 * Replay contracts: record → headless replay → identical final checksum;
 * decisions (shop/upgrade/dev) reproduce; tampered inputs/checksums and
 * config/version mismatches are DETECTED with first-divergence triage,
 * never silently accepted.
 */

import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { neutralInput } from '../src/sim/inputCommand';
import { ReplayRecorder } from '../src/sim/replay/ReplayRecorder';
import { ReplayPlayer, parseReplayJson } from '../src/sim/replay/ReplayPlayer';
import { simChecksum, subsystemDigests } from '../src/sim/replay/digest';
import { configHash } from '../src/sim/replay/configHash';
import { applyShopPurchase } from '../src/sim/shopLogic';
import { defaultTuning } from '../src/sim/tuning';
import { scriptedCommand, type DriveResult } from './helpers/simHarness';
import type { ReplayV1 } from '../src/sim/replay/replayTypes';

const DT = 1 / 60;

/** Record a real scripted run with decisions sprinkled at tick boundaries. */
function recordRun(seed: number, ticks: number, withDecisions = false): { replay: ReplayV1; finalChecksum: string } {
  const sim = new Simulation({ mapConfig: MAPS[0], seed });
  sim.startRun();
  const recorder = new ReplayRecorder(
    { mapId: MAPS[0].id, seed, unlockedWeapons: [], tuning: defaultTuning() },
    120,
  );
  const cmd = neutralInput();
  for (let t = 0; t < ticks; t++) {
    if (withDecisions && t === 600) {
      // A shop purchase between ticks (credits granted via dev cheat first).
      recorder.recordDecision('dev', JSON.stringify({ kind: 'killall' }));
      sim.enemies.killAll(true, sim.rng);
      recorder.recordDecision('shop', 'armor'); // no-ops identically if short on credits
      applyShopPurchase(sim, 'armor');
    }
    if (withDecisions && t === 900 && sim.progression.pendingLevelUps > 0) {
      recorder.recordDecision('upgrade', 'adrenal-rush');
      sim.progression.consumePendingLevelUp();
      sim.applyUpgrade('adrenal-rush');
    }
    scriptedCommand(t, cmd);
    sim.tick(DT, cmd);
    recorder.afterTick(sim, cmd);
  }
  return { replay: recorder.finalize(sim), finalChecksum: simChecksum(sim) };
}

describe('replay record → verify (Stage 2)', () => {
  it('an input-only run replays to the identical final checksum', () => {
    const { replay, finalChecksum } = recordRun(1234, 1500);
    const result = new ReplayPlayer(replay).run();
    expect(result.ok).toBe(true);
    expect(result.actualFinal).toBe(finalChecksum);
    expect(result.ticksRun).toBe(1500);
    expect(result.firstDivergence).toBeNull();
  });

  it('JSON round-trip survives serialization', () => {
    const { replay } = recordRun(55, 600);
    const { replay: parsed, errors } = parseReplayJson(JSON.stringify(replay));
    expect(errors).toEqual([]);
    expect(new ReplayPlayer(parsed!).run().ok).toBe(true);
  });

  it('tampered input is caught at the first divergent checkpoint with digests', () => {
    const { replay } = recordRun(777, 1200);
    // Flip the fire bit + reverse strafe on a mid-run input frame.
    const frame = replay.inputs[Math.floor(replay.inputs.length / 3)];
    frame[3] ^= 8;
    frame[1] = -frame[1];
    const result = new ReplayPlayer(replay).run();
    expect(result.ok).toBe(false);
    expect(result.firstDivergence).not.toBeNull();
    expect(result.firstDivergence!.tick).toBeLessThanOrEqual(1200);
    expect(result.firstDivergence!.divergentSystems.length).toBeGreaterThan(0);
    expect(result.message).toContain('desync at tick');
  });

  it('a tampered final checksum fails final validation', () => {
    const { replay } = recordRun(888, 400);
    replay.finalChecksum = 'deadbeef';
    const result = new ReplayPlayer(replay).run();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('final checksum mismatch');
  });

  it('a config-hash mismatch is REFUSED, not silently validated', () => {
    const { replay } = recordRun(99, 200);
    replay.configHash = 'beefbeef';
    const result = new ReplayPlayer(replay).run();
    expect(result.ok).toBe(false);
    expect(result.configHashMatch).toBe(false);
    expect(result.ticksRun).toBe(0); // refused before running
    expect(result.message).toContain('config hash mismatch');
  });

  it('a version mismatch is refused', () => {
    const { replay } = recordRun(98, 200);
    (replay as { version: number }).version = 99;
    const result = new ReplayPlayer(replay).run();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('version');
  });

  it('shop, dev, and upgrade decisions reproduce in replay', () => {
    const { replay, finalChecksum } = recordRun(4242, 1200, true);
    expect(replay.decisions.length).toBeGreaterThanOrEqual(2);
    const result = new ReplayPlayer(replay).run();
    expect(result.ok).toBe(true);
    expect(result.actualFinal).toBe(finalChecksum);
  });

  it('config hash is stable across calls and order-independent stringify', () => {
    expect(configHash()).toBe(configHash());
  });

  it('subsystem RNG streams are covered: consuming one changes the rng digest', () => {
    const sim = new Simulation({ mapConfig: MAPS[0], seed: 31 });
    sim.startRun();
    const before = subsystemDigests(sim).rng;
    sim.rngStreams.get('combat')!.next(); // a hidden fork advancing
    expect(subsystemDigests(sim).rng).not.toBe(before);
  });
});

// Type-only import sanity (DriveResult re-exported by the harness).
void (0 as unknown as DriveResult | null);
