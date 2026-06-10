/**
 * The frame input command — the ONLY thing the input layer hands to the sim.
 * In a future networked build this struct is what gets serialized to the
 * authoritative server, so nothing in here may reference DOM or Three.js.
 */

export interface InputCommand {
  /** Strafe axis: -1 left .. 1 right. */
  moveX: number;
  /** Forward axis: -1 back .. 1 forward. */
  moveZ: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  /** Trigger held. */
  fire: boolean;
  /** Trigger pressed this frame (semi-auto edge). */
  firePressed: boolean;
  aim: boolean;
  reload: boolean;
  /** Weapon slot request (0 = melee, 1-6 = guns), or -1 for none. */
  weaponSlot: number;
  /** Scroll-wheel weapon cycling: -1, 0, or 1. */
  weaponDelta: number;
  /** Look deltas in radians, already scaled by sensitivity. */
  lookDX: number;
  lookDY: number;
  interact: boolean;
}

export const neutralInput = (): InputCommand => ({
  moveX: 0,
  moveZ: 0,
  jump: false,
  sprint: false,
  crouch: false,
  fire: false,
  firePressed: false,
  aim: false,
  reload: false,
  weaponSlot: -1,
  weaponDelta: 0,
  lookDX: 0,
  lookDY: 0,
  interact: false,
});

export const resetFrameEdges = (cmd: InputCommand): void => {
  cmd.firePressed = false;
  cmd.reload = false;
  cmd.jump = false;
  cmd.weaponSlot = -1;
  cmd.weaponDelta = 0;
  cmd.lookDX = 0;
  cmd.lookDY = 0;
  cmd.interact = false;
};
