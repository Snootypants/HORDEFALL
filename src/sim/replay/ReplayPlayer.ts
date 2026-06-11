/**
 * Replays a ReplayV1 headlessly (or under a renderer) and validates it.
 * READ-ONLY by construction: this module lives in src/sim, which the
 * boundary test forbids from importing save/UI/game code — replaying can
 * never touch player progression.
 *
 * Validation: refuses on version/config-hash mismatch, compares every
 * checkpoint while stepping, and reports the FIRST divergent tick with
 * per-subsystem digests instead of a bare "checksum mismatch".
 */

import { Simulation } from '../Simulation';
import { mapById } from '../../config/maps';
import { neutralInput, resetFrameEdges } from '../inputCommand';
import { applyShopPurchase, type ShopItemKind } from '../shopLogic';
import { runDevAction, type DevAction } from '../devActions';
import { simChecksum, subsystemDigests } from './digest';
import { configHash } from './configHash';
import { REPLAY_VERSION, decodeInto, type ReplayV1 } from './replayTypes';

const SIM_DT = 1 / 60;

export interface ReplayDivergence {
  tick: number;
  expected: string;
  actual: string;
  /** Subsystems whose digests differ at the divergent checkpoint. */
  divergentSystems: string[];
  expectedDigests: Record<string, string>;
  actualDigests: Record<string, string>;
}

export interface ReplayValidation {
  ok: boolean;
  versionMatch: boolean;
  configHashMatch: boolean;
  ticksRun: number;
  expectedFinal: string;
  actualFinal: string;
  firstDivergence: ReplayDivergence | null;
  /** Human-readable refusal/summary. */
  message: string;
}

export class ReplayPlayer {
  readonly replay: ReplayV1;
  readonly sim: Simulation;
  readonly versionMatch: boolean;
  readonly configHashMatch: boolean;

  /** Ticks executed so far. */
  ticksRun = 0;
  firstDivergence: ReplayDivergence | null = null;

  private inputCursor = 0;
  private inputRunLeft = 0;
  private decisionCursor = 0;
  private checkpointCursor = 0;
  private readonly cmd = neutralInput();

  constructor(replay: ReplayV1) {
    this.replay = replay;
    this.versionMatch = replay.version === REPLAY_VERSION;
    this.configHashMatch = replay.configHash === configHash();
    const mapConfig = mapById(replay.mapId);
    if (!mapConfig) throw new Error(`replay references unknown map "${replay.mapId}"`);
    this.sim = new Simulation({
      mapConfig,
      seed: replay.seed,
      unlockedWeapons: replay.unlockedWeapons,
      tuning: replay.tuning,
    });
    this.sim.startRun();
    if (replay.inputs.length > 0) this.inputRunLeft = replay.inputs[0][0];
  }

  get done(): boolean {
    return this.ticksRun >= this.replay.ticks;
  }

  /** Execute one recorded tick (decisions due at this boundary first). */
  step(): boolean {
    if (this.done) return false;
    const r = this.replay;

    while (this.decisionCursor < r.decisions.length && r.decisions[this.decisionCursor].tick === this.ticksRun) {
      this.applyDecision(r.decisions[this.decisionCursor]);
      this.decisionCursor++;
    }

    if (this.inputRunLeft <= 0) {
      this.inputCursor++;
      if (this.inputCursor >= r.inputs.length) return false;
      this.inputRunLeft = r.inputs[this.inputCursor][0];
    }
    decodeInto(r.inputs[this.inputCursor], this.cmd);
    this.inputRunLeft--;

    this.sim.tick(SIM_DT, this.cmd);
    resetFrameEdges(this.cmd);
    this.ticksRun++;

    // Checkpoint comparison at the recorded cadence.
    const cp = r.checkpoints[this.checkpointCursor];
    if (cp && cp.tick === this.ticksRun && this.firstDivergence === null) {
      this.checkpointCursor++;
      const actual = simChecksum(this.sim);
      if (actual !== cp.checksum) {
        const actualDigests = subsystemDigests(this.sim);
        this.firstDivergence = {
          tick: cp.tick,
          expected: cp.checksum,
          actual,
          divergentSystems: Object.keys(cp.digests).filter((k) => cp.digests[k] !== actualDigests[k]),
          expectedDigests: cp.digests,
          actualDigests,
        };
      }
    }
    return true;
  }

  private applyDecision(d: ReplayV1['decisions'][number]): void {
    if (d.kind === 'upgrade') {
      if (this.sim.progression.consumePendingLevelUp()) this.sim.applyUpgrade(d.data);
    } else if (d.kind === 'shop') {
      applyShopPurchase(this.sim, d.data as ShopItemKind);
    } else {
      runDevAction(this.sim, JSON.parse(d.data) as DevAction);
    }
  }

  /** Run to the end (or first refusal) and produce the validation verdict. */
  run(): ReplayValidation {
    if (!this.versionMatch || !this.configHashMatch) {
      return this.verdict(false,
        !this.versionMatch
          ? `refused: replay version ${this.replay.version} ≠ engine version ${REPLAY_VERSION}`
          : 'refused: config hash mismatch — game data changed since this replay was recorded');
    }
    while (this.step()) { /* drive to completion */ }
    const actualFinal = simChecksum(this.sim);
    if (this.firstDivergence) {
      return this.verdict(false,
        `desync at tick ${this.firstDivergence.tick} (systems: ${this.firstDivergence.divergentSystems.join(', ')})`);
    }
    if (actualFinal !== this.replay.finalChecksum) {
      return this.verdict(false, `final checksum mismatch: ${actualFinal} ≠ ${this.replay.finalChecksum}`);
    }
    return this.verdict(true, `verified: ${this.ticksRun} ticks, final checksum ${actualFinal}`);
  }

  private verdict(ok: boolean, message: string): ReplayValidation {
    return {
      ok,
      versionMatch: this.versionMatch,
      configHashMatch: this.configHashMatch,
      ticksRun: this.ticksRun,
      expectedFinal: this.replay.finalChecksum,
      actualFinal: simChecksum(this.sim),
      firstDivergence: this.firstDivergence,
      message,
    };
  }
}

/** Parse + structurally validate replay JSON. Never throws. */
export function parseReplayJson(json: string): { replay: ReplayV1 | null; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { replay: null, errors: [`invalid JSON: ${String(e)}`] };
  }
  const r = raw as Partial<ReplayV1>;
  const errors: string[] = [];
  if (!r || typeof r !== 'object') errors.push('replay: expected an object');
  else {
    if (r.version !== REPLAY_VERSION) errors.push(`unsupported replay version ${String(r.version)}`);
    if (typeof r.seed !== 'number') errors.push('missing seed');
    if (typeof r.mapId !== 'string') errors.push('missing mapId');
    if (!Array.isArray(r.inputs)) errors.push('missing inputs');
    if (!Array.isArray(r.decisions)) errors.push('missing decisions');
    if (!Array.isArray(r.checkpoints)) errors.push('missing checkpoints');
    if (typeof r.ticks !== 'number') errors.push('missing ticks');
    if (typeof r.finalChecksum !== 'string') errors.push('missing finalChecksum');
  }
  return errors.length > 0 ? { replay: null, errors } : { replay: raw as ReplayV1, errors: [] };
}
