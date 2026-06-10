/**
 * Input collection: keyboard, mouse (pointer lock), wheel, and gamepad,
 * mapped through rebindable bindings into the sim-facing InputCommand.
 * The sim never touches DOM events — it only ever sees the command struct.
 */

import type { GameAction } from './bindings';
import { DEFAULT_KEYBINDS } from './bindings';
import type { InputCommand } from '../sim/inputCommand';
import { neutralInput } from '../sim/inputCommand';
import { pollGamepad } from './GamepadInput';

export class InputManager {
  bindings: Record<GameAction, string> = { ...DEFAULT_KEYBINDS };
  mouseSensitivity = 1.0;
  invertY = false;
  /** When false (menus open), gameplay commands read neutral. */
  gameplayEnabled = false;
  gamepadEnabled = true;

  private readonly held = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private accumDX = 0;
  private accumDY = 0;
  private wheelDelta = 0;
  private readonly cmd: InputCommand = neutralInput();
  private captureCallback: ((code: string) => void) | null = null;
  private readonly canvas: HTMLCanvasElement;

  /** Raw look deltas this frame (viewmodel sway reads these). */
  lastLookDX = 0;
  lastLookDY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.captureCallback) {
        e.preventDefault();
        this.finishCapture(e.code);
        return;
      }
      this.held.add(e.code);
      this.pressedThisFrame.add(e.code);
      // Keep the browser from stealing game keys while locked
      if (document.pointerLockElement && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));

    window.addEventListener('mousedown', (e) => {
      const code = `Mouse${e.button}`;
      if (this.captureCallback) {
        this.finishCapture(code);
        return;
      }
      this.held.add(code);
      this.pressedThisFrame.add(code);
    });
    window.addEventListener('mouseup', (e) => this.held.delete(`Mouse${e.button}`));

    window.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      this.accumDX += e.movementX;
      this.accumDY += e.movementY;
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (document.pointerLockElement) this.wheelDelta += Math.sign(e.deltaY);
      },
      { passive: true },
    );

    window.addEventListener('blur', () => {
      this.held.clear();
    });
  }

  requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  onPointerLockChange(handler: (locked: boolean) => void): void {
    document.addEventListener('pointerlockchange', () => handler(this.pointerLocked));
  }

  /** Settings UI: capture the next key/mouse press for rebinding. */
  captureNextKey(callback: (code: string) => void): void {
    this.captureCallback = callback;
  }

  cancelCapture(): void {
    this.captureCallback = null;
  }

  private finishCapture(code: string): void {
    const cb = this.captureCallback;
    this.captureCallback = null;
    cb?.(code);
  }

  private isHeld(action: GameAction): boolean {
    return this.held.has(this.bindings[action]);
  }

  private wasPressed(action: GameAction): boolean {
    return this.pressedThisFrame.has(this.bindings[action]);
  }

  /** UI-level edge checks (pause/console work even when gameplay is off). */
  consumeUiPress(action: GameAction): boolean {
    const code = this.bindings[action];
    if (this.pressedThisFrame.has(code)) {
      this.pressedThisFrame.delete(code);
      return true;
    }
    return false;
  }

  /** Build this frame's InputCommand. Call exactly once per rAF. */
  sample(): InputCommand {
    const cmd = this.cmd;
    const dxRaw = this.accumDX;
    const dyRaw = this.accumDY;
    this.accumDX = 0;
    this.accumDY = 0;

    const sens = 0.0022 * this.mouseSensitivity;
    this.lastLookDX = dxRaw * sens;
    this.lastLookDY = dyRaw * sens * (this.invertY ? -1 : 1);

    if (!this.gameplayEnabled) {
      Object.assign(cmd, neutralInput());
      this.pressedThisFrame.clear();
      this.wheelDelta = 0;
      this.lastLookDX = 0;
      this.lastLookDY = 0;
      return cmd;
    }

    cmd.moveX = (this.isHeld('moveRight') ? 1 : 0) - (this.isHeld('moveLeft') ? 1 : 0);
    cmd.moveZ = (this.isHeld('moveForward') ? 1 : 0) - (this.isHeld('moveBack') ? 1 : 0);
    cmd.sprint = this.isHeld('sprint');
    cmd.crouch = this.isHeld('crouch');
    cmd.jump = this.wasPressed('jump');
    cmd.fire = this.isHeld('fire');
    cmd.firePressed = this.wasPressed('fire');
    cmd.aim = this.isHeld('aim');
    cmd.reload = this.wasPressed('reload');
    cmd.interact = this.wasPressed('interact');
    cmd.lookDX = this.lastLookDX;
    cmd.lookDY = this.lastLookDY;

    cmd.weaponSlot = 0;
    for (let slot = 1; slot <= 6; slot++) {
      if (this.wasPressed(`weapon${slot}` as GameAction)) cmd.weaponSlot = slot;
    }
    cmd.weaponDelta = 0;
    if (this.wheelDelta !== 0) {
      const next = this.bindings.weaponNext === 'WheelDown' ? this.wheelDelta > 0 : this.wheelDelta < 0;
      cmd.weaponDelta = next ? 1 : -1;
    }

    if (this.gamepadEnabled) pollGamepad(cmd, this);

    this.pressedThisFrame.clear();
    this.wheelDelta = 0;
    return cmd;
  }
}
