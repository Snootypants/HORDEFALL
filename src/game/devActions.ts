/**
 * Developer/debug actions shared by the dev console and the debug menu.
 * Pure functions over the Simulation — no UI dependencies.
 */

import type { Simulation } from '../sim/Simulation';

export type DevAction =
  | { kind: 'spawn'; enemyId: string; count: number }
  | { kind: 'stress'; count: number }
  | { kind: 'god' }
  | { kind: 'noclip' }
  | { kind: 'skipwave' }
  | { kind: 'forceboss' }
  | { kind: 'unlockall' }
  | { kind: 'killall' };

export function runDevAction(sim: Simulation, action: DevAction): unknown {
  switch (action.kind) {
    case 'spawn': {
      for (let i = 0; i < action.count; i++) {
        const a = (i / Math.max(1, action.count)) * Math.PI * 2;
        const r = 8 + (i % 5);
        sim.debugSpawnEnemy(action.enemyId, sim.player.x + Math.cos(a) * r, sim.player.z + Math.sin(a) * r);
      }
      return undefined;
    }
    case 'stress': {
      // Ring of mixed light enemies — the canonical performance scenario.
      const mix = ['rusher', 'rusher', 'crawler', 'spitter'];
      for (let i = 0; i < action.count; i++) {
        const a = (i / action.count) * Math.PI * 2 * 7; // spiral
        const r = 15 + (i % 30);
        sim.debugSpawnEnemy(
          mix[i % mix.length],
          sim.player.x + Math.cos(a) * r,
          sim.player.z + Math.sin(a) * r,
        );
      }
      return undefined;
    }
    case 'god':
      sim.player.godMode = !sim.player.godMode;
      return sim.player.godMode;
    case 'noclip':
      sim.player.noclip = !sim.player.noclip;
      return sim.player.noclip;
    case 'skipwave':
      if (sim.waves.state === 'break') sim.waves.skipBreak();
      else sim.enemies.killAll(false, sim.rng);
      return undefined;
    case 'forceboss':
      sim.waves.forcedEventId = 'boss';
      return undefined;
    case 'unlockall':
      for (const w of sim.weapons.weapons) sim.weapons.unlock(w.id);
      return undefined;
    case 'killall':
      sim.enemies.killAll(true, sim.rng);
      return undefined;
  }
}
