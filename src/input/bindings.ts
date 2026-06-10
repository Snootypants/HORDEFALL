/**
 * Game actions and default key bindings. The settings UI rebinds these;
 * bindings persist in the save file. Keys use KeyboardEvent.code values
 * (mouse buttons are "Mouse0".."Mouse4", wheel is "WheelUp"/"WheelDown").
 */

export type GameAction =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'fire'
  | 'aim'
  | 'reload'
  | 'interact'
  | 'weapon0'
  | 'weapon1'
  | 'weapon2'
  | 'weapon3'
  | 'weapon4'
  | 'weapon5'
  | 'weapon6'
  | 'weaponNext'
  | 'weaponPrev'
  | 'openShop'
  | 'pause'
  | 'toggleConsole'
  | 'toggleDebugOverlay'
  | 'toggleDebugMenu';

export const DEFAULT_KEYBINDS: Record<GameAction, string> = {
  moveForward: 'KeyW',
  moveBack: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  fire: 'Mouse0',
  aim: 'Mouse2',
  reload: 'KeyR',
  interact: 'KeyE',
  weapon0: 'Digit0',
  weapon1: 'Digit1',
  weapon2: 'Digit2',
  weapon3: 'Digit3',
  weapon4: 'Digit4',
  weapon5: 'Digit5',
  weapon6: 'Digit6',
  weaponNext: 'WheelDown',
  weaponPrev: 'WheelUp',
  openShop: 'KeyB',
  pause: 'Escape',
  toggleConsole: 'Backquote',
  toggleDebugOverlay: 'F3',
  toggleDebugMenu: 'F8',
};

export const ACTION_LABELS: Record<GameAction, string> = {
  moveForward: 'Move Forward',
  moveBack: 'Move Back',
  moveLeft: 'Strafe Left',
  moveRight: 'Strafe Right',
  jump: 'Jump',
  sprint: 'Sprint',
  crouch: 'Crouch',
  fire: 'Fire',
  aim: 'Aim',
  reload: 'Reload',
  interact: 'Interact',
  weapon0: 'Melee (Slot 0)',
  weapon1: 'Weapon Slot 1',
  weapon2: 'Weapon Slot 2',
  weapon3: 'Weapon Slot 3',
  weapon4: 'Weapon Slot 4',
  weapon5: 'Weapon Slot 5',
  weapon6: 'Weapon Slot 6',
  weaponNext: 'Next Weapon',
  weaponPrev: 'Previous Weapon',
  openShop: 'Open Shop (between waves)',
  pause: 'Pause',
  toggleConsole: 'Dev Console',
  toggleDebugOverlay: 'Debug Overlay',
  toggleDebugMenu: 'Developer Menu',
};

/**
 * Conflict-safe assignment: binds `code` to `action`, unbinding any other
 * action that held the same key. Returns the displaced action (so the UI can
 * warn) or null. Two actions must never silently share one key.
 */
export function assignBinding(
  binds: Record<GameAction, string>,
  action: GameAction,
  code: string,
): GameAction | null {
  let displaced: GameAction | null = null;
  for (const key of Object.keys(binds) as GameAction[]) {
    if (key !== action && binds[key] === code) {
      binds[key] = '';
      displaced = key;
      break;
    }
  }
  binds[action] = code;
  return displaced;
}
