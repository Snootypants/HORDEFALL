/**
 * Stage 2 P4: burning enemies request visible flame effects. The collector
 * (render/fx/flameEmitters.ts) is pure data — no THREE — so the seam is
 * testable headless: burning enemies yield capped, positioned emitters that
 * stop when burning expires or the enemy dies.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ENEMIES, enemyById } from '../src/config/enemies';
import { EnemyManager } from '../src/sim/enemies/EnemyManager';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import type { GameEvents } from '../src/sim/events';
import { collectFlameEmitters, type FlameEmitter } from '../src/render/fx/flameEmitters';

describe('flame emitters (P4)', () => {
  let bus: EventBus<GameEvents>;
  let mgr: EnemyManager;
  const out: FlameEmitter[] = [];

  function spawn(x: number, z: number): number {
    const cfg = enemyById('rusher')!;
    return mgr.spawn(cfg, { hp: 1000, damage: 1, speed: 0, scale: 1, xp: 0, score: 0 }, x, z, false, 1);
  }

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    mgr = new EnemyManager(ENEMIES, bus);
  });

  it('only burning enemies emit, at their body position', () => {
    const a = spawn(1, 2);
    spawn(5, 6); // not burning
    mgr.applyStatus(a, 'burning');
    const n = collectFlameEmitters(mgr, 24, out);
    expect(n).toBe(1);
    expect(out[0].x).toBeCloseTo(mgr.posX[a]);
    expect(out[0].z).toBeCloseTo(mgr.posZ[a]);
    expect(out[0].y).toBeGreaterThan(0); // mid-body, not at the feet
  });

  it('emitter count is capped', () => {
    for (let i = 0; i < 30; i++) mgr.applyStatus(spawn(i, 0), 'burning');
    expect(collectFlameEmitters(mgr, 24, out)).toBe(24);
  });

  it('stops when burning expires', () => {
    const a = spawn(0, 0);
    mgr.applyStatus(a, 'burning');
    for (let t = 0; t < 60 * 4; t++) mgr.status.tick(a, 1 / 60); // > 3s duration
    expect(collectFlameEmitters(mgr, 24, out)).toBe(0);
  });

  it('stops when the enemy dies', () => {
    const a = spawn(0, 0);
    mgr.applyStatus(a, 'burning');
    mgr.kill(a, true, new Rng(1));
    expect(collectFlameEmitters(mgr, 24, out)).toBe(0);
  });
});
