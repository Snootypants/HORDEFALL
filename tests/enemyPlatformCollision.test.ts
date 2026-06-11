/**
 * Stage 2 P3: platforms are solid for enemies in 3D.
 *  - No melee/contact damage through a platform floor (vertical reach + LOS).
 *  - Enemies whose visible body doesn't fit under a platform bump into its
 *    side instead of clipping their heads through it.
 *  - When a ramp exists, melee enemies climb it (posY follows ground) and
 *    reach a platform player.
 *  - Ground combat is unchanged.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ENEMIES, enemyById } from '../src/config/enemies';
import { MAPS } from '../src/config/maps';
import { EnemyManager } from '../src/sim/enemies/EnemyManager';
import { updateEnemies, type EnemyUpdateCtx } from '../src/sim/enemies/enemyAI';
import { EnemyProjectiles } from '../src/sim/enemies/enemyProjectiles';
import { CollisionWorld } from '../src/sim/collision';
import { Barrels } from '../src/sim/barrels';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import type { GameEvents } from '../src/sim/events';
import type { MapData, StaticBox } from '../src/sim/mapGen';

const PLATFORM_TOP = 2.4;

const slab = (minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number, kind: StaticBox['kind']): StaticBox =>
  ({ minX, maxX, minZ, maxZ, minY, maxY, kind });

function makeMap(boxes: StaticBox[], rampEntries: { x: number; z: number }[] = []): MapData {
  return {
    config: { ...MAPS[0], size: 80 },
    seed: 1,
    boxes,
    barrels: [],
    spawnPoints: [],
    playerSpawn: { x: 0, z: 0 },
    safeZones: [],
    dangerZones: [],
    rampEntries,
  };
}

/** Platform slab spanning x 0..8, z -4..4, top at 2.4. */
const PLATFORM = slab(0, 8, -4, 4, PLATFORM_TOP - 0.5, PLATFORM_TOP, 'platform');

/** Six climbable steps walking up to the platform from -X. */
function rampSteps(): StaticBox[] {
  const out: StaticBox[] = [];
  for (let i = 0; i < 6; i++) {
    const cx = -(6 - i) * 1.1 + 0.55; // step centers from x≈-6.05 to -0.55
    out.push(slab(cx - 0.55, cx + 0.55, -1.5, 1.5, 0, (PLATFORM_TOP / 6) * (i + 1), 'ramp'));
  }
  return out;
}

describe('enemy platform collision (P3)', () => {
  let bus: EventBus<GameEvents>;
  let mgr: EnemyManager;
  let damageTaken: number;

  function makeCtx(map: MapData, playerX: number, playerY: number, playerZ: number): EnemyUpdateCtx {
    return {
      dt: 1 / 60,
      simTime: 0,
      playerX,
      playerY,
      playerZ,
      playerAlive: true,
      collision: new CollisionWorld(map),
      rng: new Rng(5),
      bus,
      projectiles: new EnemyProjectiles(),
      damagePlayer: (amount) => { damageTaken += amount; },
      slowAuraActive: false,
      aiThrottle: false,
      barrels: new Barrels([]),
      rampEntries: map.rampEntries,
    };
  }

  function run(ctx: EnemyUpdateCtx, seconds: number): void {
    const steps = Math.round(seconds * 60);
    for (let s = 0; s < steps; s++) {
      ctx.simTime += 1 / 60;
      updateEnemies(mgr, ctx);
    }
  }

  function spawnRusher(x: number, z: number): number {
    const cfg = enemyById('rusher')!;
    return mgr.spawn(cfg, { hp: 1000, damage: 12, speed: cfg.speed, scale: 1, xp: 0, score: 0 }, x, z, false, 1);
  }

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    mgr = new EnemyManager(ENEMIES, bus);
    damageTaken = 0;
  });

  it('cannot damage a player standing above it through the platform floor', () => {
    const ctx = makeCtx(makeMap([PLATFORM]), 0.9, PLATFORM_TOP, 0); // player on the slab
    spawnRusher(-0.6, 0); // at the platform's side, directly below the edge
    run(ctx, 5);
    expect(damageTaken).toBe(0);
  });

  it('bumps into the platform side instead of clipping its head through', () => {
    const ctx = makeCtx(makeMap([PLATFORM]), 4, PLATFORM_TOP, 0); // player mid-platform
    const idx = spawnRusher(-6, 0); // approaches from -X at ground level
    run(ctx, 6);
    // Rusher's visible body (≈3.2 tall) does not fit under the slab: it must
    // stay outside the platform footprint, at ground level.
    expect(mgr.posX[idx]).toBeLessThan(PLATFORM.minX + 0.01);
    expect(mgr.posY[idx]).toBeLessThan(0.1);
    expect(damageTaken).toBe(0);
  });

  it('climbs a ramp to reach and damage a platform player', () => {
    const map = makeMap([PLATFORM, ...rampSteps()], [{ x: -6.05, z: 0 }]);
    const ctx = makeCtx(map, 2, PLATFORM_TOP, 0); // player on the platform
    const idx = spawnRusher(-12, 0);
    run(ctx, 20);
    expect(mgr.posY[idx]).toBeGreaterThan(1.8); // it climbed
    expect(damageTaken).toBeGreaterThan(0); // and reached the player
  });

  it('regression: still approaches and damages a ground-level player', () => {
    const ctx = makeCtx(makeMap([]), 0, 0, 0);
    spawnRusher(-8, 0);
    run(ctx, 6);
    expect(damageTaken).toBeGreaterThan(0);
  });
});
