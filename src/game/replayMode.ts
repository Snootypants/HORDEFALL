/**
 * Browser replay viewer mode: loads a ReplayV1, steps its read-only
 * Simulation under the normal renderer, and exposes transport controls
 * (play/pause/step/fast-forward/free-cam) plus live tick/checksum status
 * and the final validation verdict. NEVER persists anything — the host
 * mounts the replay sim without wiring achievements or run persistence.
 */

import { ReplayPlayer, parseReplayJson, type ReplayValidation } from '../sim/replay/ReplayPlayer';
import type { Simulation } from '../sim/Simulation';
import { ReplayControls } from '../ui/ReplayControls';

const SIM_DT = 1 / 60;
const FF_MULT = 8;

export interface ReplayHost {
  /** Attach the replay sim to renderer/HUD/audio (no achievements, no saves). */
  mount(sim: Simulation): void;
  /** Tear the replay presentation down and return to the main menu. */
  unmount(): void;
  /** Toggle the renderer's free orbit camera. */
  setFreeCam(on: boolean): void;
}

export class ReplayModeController {
  player: ReplayPlayer | null = null;
  private mode: 'paused' | 'playing' | 'ff' = 'paused';
  private acc = 0;
  private verdict: ReplayValidation | null = null;
  private freeCam = false;
  private readonly host: ReplayHost;
  readonly controls: ReplayControls;

  constructor(host: ReplayHost, uiRoot: HTMLElement) {
    this.host = host;
    this.controls = new ReplayControls(uiRoot, (action) => this.control(action));
  }

  get active(): boolean {
    return this.player !== null;
  }

  /** Load replay JSON and enter viewer mode. Returns an error or null. */
  start(json: string): string | null {
    const { replay, errors } = parseReplayJson(json);
    if (!replay) return errors.join('; ');
    let player: ReplayPlayer;
    try {
      player = new ReplayPlayer(replay);
    } catch (e) {
      return String(e);
    }
    this.player = player;
    this.mode = 'paused';
    this.acc = 0;
    this.verdict = null;
    this.freeCam = false;
    this.host.mount(player.sim);
    this.controls.show();
    this.refreshStatus();
    return null;
  }

  exit(): void {
    if (!this.player) return;
    this.player = null;
    this.verdict = null;
    this.controls.hide();
    this.host.setFreeCam(false);
    this.host.unmount();
  }

  control(action: 'play' | 'pause' | 'step' | 'ff' | 'freecam' | 'exit'): void {
    if (!this.player) return;
    switch (action) {
      case 'play': this.mode = 'playing'; break;
      case 'pause': this.mode = 'paused'; break;
      case 'ff': this.mode = this.mode === 'ff' ? 'playing' : 'ff'; break;
      case 'step':
        this.mode = 'paused';
        this.stepOnce();
        break;
      case 'freecam':
        this.freeCam = !this.freeCam;
        this.host.setFreeCam(this.freeCam);
        break;
      case 'exit': this.exit(); return;
    }
    this.refreshStatus();
  }

  /** Advance the replay clock; called every rAF frame by the Game loop. */
  update(dtReal: number): void {
    const p = this.player;
    if (!p) return;
    const mult = this.mode === 'ff' ? FF_MULT : this.mode === 'playing' ? 1 : 0;
    if (mult > 0) {
      this.acc += dtReal * mult;
      let guard = 0;
      while (this.acc >= SIM_DT && guard++ < FF_MULT * 4) {
        if (!this.stepOnce()) break;
        this.acc -= SIM_DT;
      }
    }
    this.refreshStatus();
  }

  private stepOnce(): boolean {
    const p = this.player;
    if (!p) return false;
    const advanced = p.step();
    if (p.done && this.verdict === null) {
      this.verdict = p.run(); // already done: builds the final verdict only
      this.mode = 'paused';
    }
    return advanced;
  }

  private refreshStatus(): void {
    const p = this.player;
    if (!p) return;
    const warn = !p.configHashMatch ? ' ⚠ config mismatch — validation refused'
      : !p.versionMatch ? ' ⚠ version mismatch — validation refused' : '';
    const desync = p.firstDivergence ? ` ✗ desync @ tick ${p.firstDivergence.tick}` : '';
    const final = this.verdict ? ` — ${this.verdict.ok ? '✓' : '✗'} ${this.verdict.message}` : '';
    this.controls.setStatus(
      `tick ${p.ticksRun}/${p.replay.ticks} · t=${(p.sim.time).toFixed(1)}s · ${this.mode}${warn}${desync}${final}`,
    );
  }
}
