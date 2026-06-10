/**
 * Boss phase behavior: phase selection by HP fraction must drive the phase's
 * speedMult into actual movement, and phase transitions must emit boss:phase.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { ENEMIES } from '../src/config/enemies';
import { EnemyManager } from '../src/sim/enemies/EnemyManager';
import { updateEnemies, type EnemyUpdateCtx } from '../src/sim/enemies/enemyAI';
import { scaleBoss } from '../src/sim/enemies/scaling';
import { BALANCE } from '../src/config/balance';
import { Barrels } from '../src/sim/barrels';
import type { GameEvents } from '../src/sim/events';
import type { CollisionWorld } from '../src/sim/collision';

const bossCfg = ENEMIES.find((e) => e.role === 'boss')!;

const fakeCollision = {
  pushOutCircle: () => {},
  losBlocked: () => false,
} as unknown as CollisionWorld;

function makeCtx(bus: EventBus<GameEvents>): EnemyUpdateCtx {
  return {
    dt: 1 / 60,
    simTime: 0,
    playerX: 0,
    playerY: 0,
    playerZ: -40,
    playerAlive: true,
    collision: fakeCollision,
    rng: new Rng(7),
    bus,
    projectiles: { spawn: () => {} } as never,
    damagePlayer: () => {},
    slowAuraActive: false,
    aiThrottle: false,
    barrels: new Barrels([]),
  };
}

describe('boss phase speedMult', () => {
  let bus: EventBus<GameEvents>;
  let mgr: EnemyManager;
  let ctx: EnemyUpdateCtx;
  let idx: number;

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    mgr = new EnemyManager(ENEMIES, bus);
    ctx = makeCtx(bus);
    idx = mgr.spawn(bossCfg, scaleBoss(bossCfg, 1, BALANCE.enemyScaling), 0, 0, false, 5);
    mgr.attackCd[idx] = 999; // keep the boss walking — no slam/charge state changes
  });

  function tick(n: number): void {
    for (let i = 0; i < n; i++) {
      ctx.simTime += ctx.dt;
      updateEnemies(mgr, ctx);
    }
  }

  it('applies phase 1 speedMult of 1.0 at full hp', () => {
    tick(1);
    expect(mgr.bossSpeedMult[idx]).toBeCloseTo(1.0);
  });

  it('applies phase 2 speedMult when hp drops below 0.66', () => {
    mgr.hp[idx] = mgr.maxHp[idx] * 0.5;
    tick(1);
    expect(mgr.bossSpeedMult[idx]).toBeCloseTo(1.25);
  });

  it('applies phase 3 speedMult when hp drops below 0.33', () => {
    mgr.hp[idx] = mgr.maxHp[idx] * 0.2;
    tick(1);
    expect(mgr.bossSpeedMult[idx]).toBeCloseTo(1.5);
  });

  it('emits boss:phase exactly once per transition', () => {
    // AI thinks are ~0.05s apart with throttling off, so allow ≥4 ticks at
    // 60Hz between HP changes for a think to observe each phase.
    const phases: number[] = [];
    bus.on('boss:phase', (e) => phases.push(e.phase));
    tick(6);
    mgr.hp[idx] = mgr.maxHp[idx] * 0.5;
    tick(6);
    mgr.hp[idx] = mgr.maxHp[idx] * 0.2;
    tick(6);
    expect(phases).toEqual([2, 3]);
  });

  it('moves measurably faster in the final phase than in phase 1', () => {
    // Phase 1 travel
    tick(180);
    const phase1Travel = Math.hypot(mgr.posX[idx], mgr.posZ[idx] + 0); // from origin toward player
    // Reset position, drop to phase 3, repeat
    const travelled1 = Math.hypot(mgr.posX[idx] - 0, mgr.posZ[idx] - 0);
    mgr.posX[idx] = 0;
    mgr.posZ[idx] = 0;
    mgr.velX[idx] = 0;
    mgr.velZ[idx] = 0;
    mgr.hp[idx] = mgr.maxHp[idx] * 0.2;
    mgr.attackCd[idx] = 999;
    tick(180);
    const travelled3 = Math.hypot(mgr.posX[idx] - 0, mgr.posZ[idx] - 0);
    expect(phase1Travel).toBeGreaterThan(0);
    expect(travelled3).toBeGreaterThan(travelled1 * 1.3);
  });

  it('non-boss enemies keep a neutral boss multiplier', () => {
    const grunt = ENEMIES.find((e) => e.role === 'melee')!;
    const gi = mgr.spawn(grunt, { hp: grunt.hp, damage: grunt.damage, speed: grunt.speed, scale: grunt.scale, xp: grunt.xp, score: grunt.score }, 2, 2, false, 1);
    tick(1);
    expect(mgr.bossSpeedMult[gi]).toBeCloseTo(1.0);
  });
});
