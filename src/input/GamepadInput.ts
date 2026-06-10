/**
 * Optional gamepad support (standard mapping): left stick move, right stick
 * look, RT fire, LT aim, A jump, B crouch, X reload, LB/RB weapon cycle,
 * stick-click sprint. Merged additively into the keyboard/mouse command.
 */

import type { InputCommand } from '../sim/inputCommand';

const DEADZONE = 0.18;
const LOOK_SPEED = 0.045;

interface EdgeState {
  jump: boolean;
  reload: boolean;
  fire: boolean;
  lb: boolean;
  rb: boolean;
}

const edges: EdgeState = { jump: false, reload: false, fire: false, lb: false, rb: false };

const dz = (v: number): number => (Math.abs(v) < DEADZONE ? 0 : v);

export function pollGamepad(cmd: InputCommand, opts: { mouseSensitivity: number; invertY: boolean }): void {
  const pads = navigator.getGamepads?.();
  if (!pads) return;
  const pad = pads.find((p) => p && p.connected);
  if (!pad) return;

  const lx = dz(pad.axes[0] ?? 0);
  const ly = dz(pad.axes[1] ?? 0);
  const rx = dz(pad.axes[2] ?? 0);
  const ry = dz(pad.axes[3] ?? 0);

  if (lx !== 0) cmd.moveX = lx;
  if (ly !== 0) cmd.moveZ = -ly;
  cmd.lookDX += rx * LOOK_SPEED * opts.mouseSensitivity;
  cmd.lookDY += ry * LOOK_SPEED * opts.mouseSensitivity * (opts.invertY ? -1 : 1);

  const button = (i: number): boolean => (pad.buttons[i]?.pressed ?? false);

  // RT fire (with edge for semi-auto)
  const fireNow = button(7) || (pad.buttons[7]?.value ?? 0) > 0.4;
  if (fireNow) {
    cmd.fire = true;
    if (!edges.fire) cmd.firePressed = true;
  }
  edges.fire = fireNow;

  if (button(6)) cmd.aim = true;

  const jumpNow = button(0);
  if (jumpNow && !edges.jump) cmd.jump = true;
  edges.jump = jumpNow;

  if (button(1)) cmd.crouch = true;
  if (button(10)) cmd.sprint = true;

  const reloadNow = button(2);
  if (reloadNow && !edges.reload) cmd.reload = true;
  edges.reload = reloadNow;

  const lbNow = button(4);
  if (lbNow && !edges.lb) cmd.weaponDelta = -1;
  edges.lb = lbNow;
  const rbNow = button(5);
  if (rbNow && !edges.rb) cmd.weaponDelta = 1;
  edges.rb = rbNow;
}
