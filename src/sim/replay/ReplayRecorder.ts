/**
 * Records a live run into a ReplayV1: the per-tick input stream (RLE), every
 * non-input decision at its tick boundary, periodic checkpoints with
 * subsystem digests, and the final checksum. Renderer-independent — the
 * Game calls afterTick() from its fixed-step loop.
 */

import type { Simulation } from '../Simulation';
import type { InputCommand } from '../inputCommand';
import type { TuningOverrides } from '../tuning';
import { defaultTuning, applyTuning } from '../tuning';
import { simChecksum, subsystemDigests } from './digest';
import { configHash } from './configHash';
import {
  REPLAY_VERSION, REPLAY_APP_VERSION, encodeCommand, sameFrame,
  type ReplayV1, type ReplayDecision, type ReplayCheckpoint, type ReplayInputFrame,
} from './replayTypes';

export interface ReplayRecorderMeta {
  mapId: string;
  seed: number;
  unlockedWeapons: string[];
  tuning: TuningOverrides;
}

export class ReplayRecorder {
  /** Ticks recorded so far — the tick index the NEXT tick will execute at. */
  ticks = 0;

  private readonly meta: ReplayRecorderMeta;
  private readonly tuningSnapshot: TuningOverrides;
  private readonly inputs: ReplayInputFrame[] = [];
  private readonly decisions: ReplayDecision[] = [];
  private readonly checkpoints: ReplayCheckpoint[] = [];
  private readonly checkpointInterval: number;

  constructor(meta: ReplayRecorderMeta, checkpointInterval = 300) {
    this.meta = meta;
    this.checkpointInterval = checkpointInterval;
    // Snapshot tuning at run start — the live object can change mid-session.
    this.tuningSnapshot = defaultTuning();
    applyTuning(this.tuningSnapshot, meta.tuning);
  }

  /** Call right after sim.tick(cmd) with the SAME command object. */
  afterTick(sim: Simulation, cmd: InputCommand): void {
    const frame = encodeCommand(cmd);
    const last = this.inputs[this.inputs.length - 1];
    if (last && sameFrame(last, frame)) last[0]++;
    else this.inputs.push(frame);
    this.ticks++;
    if (this.ticks % this.checkpointInterval === 0) {
      this.checkpoints.push({ tick: this.ticks, checksum: simChecksum(sim), digests: subsystemDigests(sim) });
    }
  }

  /** Record a between-ticks gameplay decision (upgrade/shop/dev). */
  recordDecision(kind: ReplayDecision['kind'], data: string): void {
    this.decisions.push({ tick: this.ticks, kind, data });
  }

  finalize(sim: Simulation): ReplayV1 {
    return {
      version: REPLAY_VERSION,
      appVersion: REPLAY_APP_VERSION,
      configHash: configHash(),
      mapId: this.meta.mapId,
      seed: this.meta.seed,
      unlockedWeapons: [...this.meta.unlockedWeapons],
      tuning: this.tuningSnapshot,
      ticks: this.ticks,
      inputs: this.inputs,
      decisions: this.decisions,
      checkpoints: this.checkpoints,
      finalChecksum: simChecksum(sim),
    };
  }
}
