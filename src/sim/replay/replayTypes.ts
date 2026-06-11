/**
 * Replay data schema (versioned, plain JSON). A replay is the complete
 * recipe for reproducing a run: start conditions, the per-tick input
 * command stream, every non-input gameplay decision (upgrade picks, shop
 * purchases, dev actions), periodic state checkpoints with subsystem
 * digests for desync triage, and the final checksum.
 */

import type { TuningOverrides } from '../tuning';
import type { InputCommand } from '../inputCommand';
import type { ShopItemKind } from '../shopLogic';
import type { DevAction } from '../devActions';

export const REPLAY_VERSION = 1;
/** Bump alongside package.json when sim behavior changes. */
export const REPLAY_APP_VERSION = '0.1.0';

/**
 * One run-length-encoded input frame: `n` consecutive ticks of an identical
 * command, packed as [n, moveX, moveZ, flags, weaponSlot, weaponDelta,
 * lookDX, lookDY]. Flag bits: 1 jump, 2 sprint, 4 crouch, 8 fire,
 * 16 firePressed, 32 aim, 64 reload, 128 interact.
 */
export type ReplayInputFrame = [number, number, number, number, number, number, number, number];

export interface ReplayDecision {
  /** Apply BEFORE executing this tick index (decisions happen between ticks). */
  tick: number;
  kind: 'upgrade' | 'shop' | 'dev';
  /** upgrade id, ShopItemKind, or JSON-encoded DevAction. */
  data: string;
}

export interface ReplayCheckpoint {
  /** Ticks completed when this checkpoint was taken. */
  tick: number;
  checksum: string;
  digests: Record<string, string>;
}

export interface ReplayV1 {
  version: typeof REPLAY_VERSION;
  appVersion: string;
  configHash: string;
  mapId: string;
  seed: number;
  unlockedWeapons: string[];
  tuning: TuningOverrides;
  ticks: number;
  inputs: ReplayInputFrame[];
  decisions: ReplayDecision[];
  checkpoints: ReplayCheckpoint[];
  finalChecksum: string;
}

export type DecodedDecision =
  | { kind: 'upgrade'; id: string }
  | { kind: 'shop'; item: ShopItemKind }
  | { kind: 'dev'; action: DevAction };

export function encodeCommand(cmd: InputCommand): ReplayInputFrame {
  const flags =
    (cmd.jump ? 1 : 0) | (cmd.sprint ? 2 : 0) | (cmd.crouch ? 4 : 0) | (cmd.fire ? 8 : 0) |
    (cmd.firePressed ? 16 : 0) | (cmd.aim ? 32 : 0) | (cmd.reload ? 64 : 0) | (cmd.interact ? 128 : 0);
  return [1, cmd.moveX, cmd.moveZ, flags, cmd.weaponSlot, cmd.weaponDelta, cmd.lookDX, cmd.lookDY];
}

export function decodeInto(frame: ReplayInputFrame, cmd: InputCommand): void {
  cmd.moveX = frame[1];
  cmd.moveZ = frame[2];
  const flags = frame[3];
  cmd.jump = (flags & 1) !== 0;
  cmd.sprint = (flags & 2) !== 0;
  cmd.crouch = (flags & 4) !== 0;
  cmd.fire = (flags & 8) !== 0;
  cmd.firePressed = (flags & 16) !== 0;
  cmd.aim = (flags & 32) !== 0;
  cmd.reload = (flags & 64) !== 0;
  cmd.interact = (flags & 128) !== 0;
  cmd.weaponSlot = frame[4];
  cmd.weaponDelta = frame[5];
  cmd.lookDX = frame[6];
  cmd.lookDY = frame[7];
}

/** Two frames hold the same command (ignoring the run length). */
export function sameFrame(a: ReplayInputFrame, b: ReplayInputFrame): boolean {
  for (let i = 1; i < 8; i++) if (a[i] !== b[i]) return false;
  return true;
}
