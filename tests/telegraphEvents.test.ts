/**
 * Enemy readability telegraphs: the sim must emit events for exploder fuses,
 * shield deflects, and support auras so audio/visuals can sell them.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { ENEMIES, enemyById } from '../src/config/enemies';
import { EnemyManager } from '../src/sim/enemies/EnemyManager';
import { updateEnemies, type EnemyUpdateCtx } from '../src/sim/enemies/enemyAI';
import type { GameEvents } from '../src/sim/events';
import type { CollisionWorld } from '../src/sim/collision';
import type { EnemyConfig } from '../src/config/types';

const fakeCollision = {
  pushOutCircle: () => {},
  losBlocked: () => false,
} as unknown as CollisionWorld;

function statsOf(cfg: EnemyConfig) {
  return { hp: cfg.hp, damage: cfg.damage, speed: cfg.speed, scale: cfg.scale, xp: cfg.xp, score: cfg.score };
}

describe('enemy telegraph events', () => {
  let bus: EventBus<GameEvents>;
  let mgr: EnemyManager;
  let ctx: EnemyUpdateCtx;

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    mgr = new EnemyManager(ENEMIES, bus);
    ctx = {
      dt: 1 / 60,
      simTime: 0,
      playerX: 0,
      playerY: 0,
      playerZ: 0,
      playerAlive: true,
      collision: fakeCollision,
      rng: new Rng(3),
      bus,
      projectiles: { spawn: () => {} } as never,
      damagePlayer: () => {},
      slowAuraActive: false,
      aiThrottle: false,
    };
  });

  function tick(n: number): void {
    for (let i = 0; i < n; i++) {
      ctx.simTime += ctx.dt;
      updateEnemies(mgr, ctx);
    }
  }

  it('emits enemy:fuse once when an exploder starts its fuse', () => {
    const exploder = enemyById('exploder')!;
    const fuses: number[] = [];
    bus.on('enemy:fuse', (e) => fuses.push(e.fuse));
    // Spawn inside attack range → think transitions straight to Fuse.
    mgr.spawn(exploder, statsOf(exploder), 0.5, 0.5, false, 1);
    tick(4);
    expect(fuses).toHaveLength(1);
    expect(fuses[0]).toBeCloseTo(exploder.explode!.fuse);
  });

  it('emits enemy:fuse when an exploder is force-killed into its short fuse', () => {
    const exploder = enemyById('exploder')!;
    let fused = 0;
    bus.on('enemy:fuse', () => fused++);
    const idx = mgr.spawn(exploder, statsOf(exploder), 30, 30, false, 1);
    mgr.kill(idx, true, null);
    expect(fused).toBe(1);
  });

  it('emits enemy:shield-deflect when a warden blocks a frontal hit', () => {
    const warden = enemyById('warden')!;
    let deflects = 0;
    bus.on('enemy:shield-deflect', () => deflects++);
    const idx = mgr.spawn(warden, statsOf(warden), 0, -5, false, 1);
    mgr.yaw[idx] = 0; // facing -Z … attacker at -Z side is frontal
    const result = mgr.applyDamage(idx, 10, {
      fromX: 0, fromZ: -10, isHead: false, isCrit: false, byPlayer: true, weaponId: null,
    });
    expect(result.shielded).toBe(true);
    expect(deflects).toBe(1);
    // From behind: no deflect.
    mgr.applyDamage(idx, 10, { fromX: 0, fromZ: 5, isHead: false, isCrit: false, byPlayer: true, weaponId: null });
    expect(deflects).toBe(1);
  });

  it('emits enemy:aura-pulse while a shaman buffs nearby enemies', () => {
    const shaman = enemyById('shaman')!;
    const rusher = enemyById('rusher')!;
    const pulses: number[] = [];
    bus.on('enemy:aura-pulse', (e) => pulses.push(e.radius));
    // Park them far from the player (no aggro path interference) but near
    // each other; the shaman aura should still pulse.
    mgr.spawn(shaman, statsOf(shaman), 0, -10, false, 1);
    mgr.spawn(rusher, statsOf(rusher), 1, -10, false, 1);
    tick(8);
    expect(pulses.length).toBeGreaterThan(0);
    expect(pulses[0]).toBe(shaman.aura!.radius);
  });
});
