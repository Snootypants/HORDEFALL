/**
 * Keybind conflict detection: assigning a key already used by another action
 * must displace (unbind) that action and report it, never leave two actions
 * silently bound to one key.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDS, assignBinding, type GameAction } from '../src/input/bindings';

function fresh(): Record<GameAction, string> {
  return { ...DEFAULT_KEYBINDS };
}

describe('assignBinding', () => {
  it('assigns a free key with no displacement', () => {
    const binds = fresh();
    const displaced = assignBinding(binds, 'jump', 'KeyJ');
    expect(binds.jump).toBe('KeyJ');
    expect(displaced).toBeNull();
  });

  it('displaces the previous owner of a contested key', () => {
    const binds = fresh();
    const sprintKey = binds.sprint;
    const displaced = assignBinding(binds, 'crouch', sprintKey);
    expect(binds.crouch).toBe(sprintKey);
    expect(binds.sprint).toBe('');
    expect(displaced).toBe('sprint');
  });

  it('rebinding an action to its own key is a no-op displacement', () => {
    const binds = fresh();
    const displaced = assignBinding(binds, 'jump', binds.jump);
    expect(displaced).toBeNull();
    expect(binds.jump).toBe(DEFAULT_KEYBINDS.jump);
  });

  it('no two actions ever share a key after any assignment', () => {
    const binds = fresh();
    assignBinding(binds, 'reload', binds.fire);
    assignBinding(binds, 'interact', binds.reload);
    const used = Object.values(binds).filter((c) => c !== '');
    expect(new Set(used).size).toBe(used.length);
  });
});
