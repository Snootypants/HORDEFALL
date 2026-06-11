/**
 * Enemy collision with sim props: barrels must block enemy movement (they
 * already block bullets), so the horde can't ghost through cover.
 */

import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { ENEMIES, enemyById } from '../src/config/enemies';
import { EnemyManager } from '../src/sim/enemies/EnemyManager';
import { updateEnemies, type EnemyUpdateCtx } from '../src/sim/enemies/enemyAI';
import { Barrels, BARREL_RADIUS } from '../src/sim/barrels';
import type { GameEvents } from '../src/sim/events';
import type { CollisionWorld } from '../src/sim/collision';

const fakeCollision = {
  pushOutCircle: () => {},
  pushOutCircleStepped: () => false,
  groundHeightAt: () => 0,
  losBlocked: () => false,
} as unknown as CollisionWorld;

describe('enemies vs barrels', () => {
  it('an enemy walking into a barrel is pushed out, a dead barrel is not solid', () => {
    const bus = new EventBus<GameEvents>();
    const mgr = new EnemyManager(ENEMIES, bus);
    const barrels = new Barrels([{ id: 0, x: 0, z: -6 }]);
    const rusher = enemyById('rusher')!;
    const idx = mgr.spawn(rusher, { hp: rusher.hp, damage: rusher.damage, speed: rusher.speed, scale: rusher.scale, xp: rusher.xp, score: rusher.score }, 0, -12, false, 1);

    const ctx: EnemyUpdateCtx = {
      dt: 1 / 60,
      simTime: 0,
      playerX: 0,
      playerY: 0,
      playerZ: 0, // straight line: rusher at z=-12 walks toward player through the barrel at z=-6
      playerAlive: true,
      collision: fakeCollision,
      rng: new Rng(11),
      bus,
      projectiles: { spawn: () => {} } as never,
      damagePlayer: () => {},
      slowAuraActive: false,
      aiThrottle: false,
      barrels,
      rampEntries: [],
    };

    const minDist = BARREL_RADIUS + rusher.radius * rusher.scale;
    for (let i = 0; i < 360; i++) {
      ctx.simTime += ctx.dt;
      updateEnemies(mgr, ctx);
      const d = Math.hypot(mgr.posX[idx] - 0, mgr.posZ[idx] - -6);
      expect(d).toBeGreaterThanOrEqual(minDist * 0.9); // never inside the barrel
    }

    // Kill the barrel: it stops blocking and the enemy can advance past it.
    barrels.alive[0] = 0;
    let closest = Infinity;
    for (let i = 0; i < 240; i++) {
      ctx.simTime += ctx.dt;
      updateEnemies(mgr, ctx);
      closest = Math.min(closest, Math.hypot(mgr.posX[idx], mgr.posZ[idx] + 6));
    }
    expect(closest).toBeLessThan(minDist * 0.9);
  });
});
