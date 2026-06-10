/**
 * Central UI sound hook: every UI click/hover routes through one registered
 * player so menus are audible without scattering AudioManager references.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { playUiSound, setUiSoundHook } from '../src/ui/uiSound';

afterEach(() => setUiSoundHook(null));

describe('ui sound hook', () => {
  it('routes click and hover kinds to the registered hook', () => {
    const played: string[] = [];
    setUiSoundHook((kind) => played.push(kind));
    playUiSound('click');
    playUiSound('hover');
    expect(played).toEqual(['click', 'hover']);
  });

  it('is silent (and safe) with no hook registered', () => {
    expect(() => playUiSound('click')).not.toThrow();
  });

  it('unregisters cleanly', () => {
    const played: string[] = [];
    setUiSoundHook((kind) => played.push(kind));
    setUiSoundHook(null);
    playUiSound('click');
    expect(played).toEqual([]);
  });
});
