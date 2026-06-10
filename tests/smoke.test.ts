/**
 * Smoke-test mode: boots the entire simulation headless (no renderer, no DOM)
 * and plays a few seconds of game. Run with `npm run smoke`.
 * This is the integration safety net for everything the unit tests don't pin.
 */
import { describe, expect, test } from 'vitest';
import { generateMap } from '../src/sim/mapGen';
import { CollisionWorld } from '../src/sim/collision';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { BALANCE } from '../src/config/balance';
import { enemyById } from '../src/config/enemies';
import { neutralInput } from '../src/sim/inputCommand';

const makeSim = (seed = 42) => new Simulation({ mapConfig: MAPS[0], seed });

describe('map generation', () => {
  test('produces collision boxes, spawn points, and a player spawn', () => {
    const map = generateMap(MAPS[0], MAPS[0].seed);
    expect(map.boxes.length).toBeGreaterThan(20);
    expect(map.spawnPoints.length).toBeGreaterThanOrEqual(12);
    expect(map.barrels.length).toBeGreaterThan(0);
    expect(Number.isFinite(map.playerSpawn.x)).toBe(true);
  });

  test('is deterministic per seed and varies across seeds', () => {
    const a = generateMap(MAPS[0], 123);
    const b = generateMap(MAPS[0], 123);
    const c = generateMap(MAPS[0], 456);
    expect(a.boxes).toEqual(b.boxes);
    expect(JSON.stringify(a.boxes)).not.toEqual(JSON.stringify(c.boxes));
  });

  test('keeps a clear area around the player spawn', () => {
    const map = generateMap(MAPS[0], MAPS[0].seed);
    for (const box of map.boxes) {
      if (box.kind === 'wall') continue;
      const cx = (box.minX + box.maxX) / 2;
      const cz = (box.minZ + box.maxZ) / 2;
      const d2 = (cx - map.playerSpawn.x) ** 2 + (cz - map.playerSpawn.z) ** 2;
      expect(d2).toBeGreaterThan(5 * 5);
    }
  });
});

describe('collision world', () => {
  test('raycast hits perimeter walls', () => {
    const map = generateMap(MAPS[0], MAPS[0].seed);
    const world = new CollisionWorld(map);
    const hit = world.raycast(0, 1, 0, 1, 0, 0, 1000);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeLessThanOrEqual(map.config.size / 2 + 1);
  });

  test('capsule cannot walk through walls', () => {
    const map = generateMap(MAPS[0], MAPS[0].seed);
    const world = new CollisionWorld(map);
    const half = map.config.size / 2;
    const body = { x: 0, y: 0, z: 0, velX: 50, velY: 0, velZ: 0, grounded: true };
    for (let i = 0; i < 600; i++) world.moveCapsule(body, 0.4, 1.8, 1 / 60, 0.55);
    expect(body.x).toBeLessThan(half + 0.5); // stopped by the wall, not through it
  });
});

describe('headless simulation', () => {
  test('boots and ticks without throwing', () => {
    const sim = makeSim();
    sim.startRun();
    const input = neutralInput();
    for (let i = 0; i < 120; i++) sim.tick(1 / 60, input);
    expect(sim.time).toBeGreaterThan(1.9);
    expect(sim.player.alive).toBe(true);
  });

  test('wave 1 spawns enemies that approach the player', () => {
    const sim = makeSim();
    sim.startRun();
    sim.waves.skipBreak();
    const input = neutralInput();
    for (let i = 0; i < 60 * 8; i++) sim.tick(1 / 60, input);
    expect(sim.enemies.aliveCount).toBeGreaterThan(0);
    // average enemy distance should be closing toward the player
    const distNow = sim.enemies.averageDistanceTo(sim.player.x, sim.player.z);
    expect(distNow).toBeLessThan(40);
  });

  test('enemies eventually damage a stationary player', () => {
    const sim = makeSim();
    sim.startRun();
    sim.waves.skipBreak();
    const input = neutralInput();
    for (let i = 0; i < 60 * 30 && sim.player.health >= sim.player.maxHealth; i++) {
      sim.tick(1 / 60, input);
    }
    expect(sim.player.health).toBeLessThan(sim.player.maxHealth);
  });

  test('firing the pistol at a close enemy kills it and grants xp/score', () => {
    const sim = makeSim(7);
    sim.startRun();
    // debug-spawn one rusher straight ahead (player faces -Z by default)
    const idx = sim.debugSpawnEnemy('rusher', sim.player.x, sim.player.z - 6);
    expect(idx).toBeGreaterThanOrEqual(0);
    const hpBefore = sim.enemies.hp[idx];
    const input = neutralInput();
    let killed = false;
    sim.bus.on('enemy:died', () => (killed = true));
    for (let i = 0; i < 60 * 10 && !killed; i++) {
      input.fire = true;
      input.firePressed = i % 20 === 0; // semi-auto trigger pulls
      sim.tick(1 / 60, input);
    }
    expect(killed).toBe(true);
    expect(sim.progression.score).toBeGreaterThan(0);
    expect(sim.stats.kills).toBe(1);
    expect(hpBefore).toBeGreaterThan(0);
  });

  test('xp grants level-ups and chosen upgrades change stats', () => {
    const sim = makeSim();
    sim.startRun();
    sim.progression.addXp(10_000);
    expect(sim.progression.pendingLevelUps).toBeGreaterThan(0);
    const before = sim.playerStats.stats.maxHealth;
    sim.applyUpgrade('juggernaut');
    expect(sim.playerStats.stats.maxHealth).toBe(before + 25);
  });

  test('player death burns revive tokens, then ends in game-over state', () => {
    const sim = makeSim();
    sim.startRun();
    const input = neutralInput();
    const settleTicks = Math.ceil((BALANCE.player.reviveDelaySec + 0.2) * 60);
    for (let death = 0; death <= BALANCE.player.revives; death++) {
      sim.player.invulnUntil = -Infinity;
      sim.player.applyDamage(10_000, 0, 0, sim.time);
      expect(sim.player.alive).toBe(false);
      for (let i = 0; i < settleTicks; i++) sim.tick(1 / 60, input);
    }
    expect(sim.revivesLeft).toBe(0);
    expect(sim.waves.state).toBe('gameover');
  });

  test('stress: 500 debug-spawned enemies tick within the frame budget shape', () => {
    const sim = makeSim();
    sim.startRun();
    for (let i = 0; i < 500; i++) {
      const angle = (i / 500) * Math.PI * 2;
      sim.debugSpawnEnemy(i % 3 === 0 ? 'crawler' : 'rusher',
        sim.player.x + Math.cos(angle) * (20 + (i % 25)),
        sim.player.z + Math.sin(angle) * (20 + (i % 25)));
    }
    expect(sim.enemies.aliveCount).toBe(500);
    const input = neutralInput();
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) sim.tick(1 / 60, input);
    const elapsed = performance.now() - t0;
    // 60 sim ticks with 500 enemies should be far under 60 frames of budget.
    expect(elapsed).toBeLessThan(1000);
    expect(sim.enemies.aliveCount).toBeGreaterThan(0);
  });
});
