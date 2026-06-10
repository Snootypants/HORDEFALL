/**
 * Corpse budget: dying enemies linger as corpses for corpseTtlSec, the
 * corpse count is capped by a budget (oldest evicted first), and a full
 * manager evicts a corpse rather than failing to spawn.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { ENEMIES } from '../src/config/enemies';
import { EnemyManager, EState, MAX_ENEMIES } from '../src/sim/enemies/EnemyManager';
import type { GameEvents } from '../src/sim/events';

const grunt = ENEMIES.find((e) => e.role === 'melee' && !e.explode)!;
const stats = { hp: grunt.hp, damage: grunt.damage, speed: grunt.speed, scale: grunt.scale, xp: grunt.xp, score: grunt.score };

describe('corpse budget', () => {
  let mgr: EnemyManager;

  beforeEach(() => {
    mgr = new EnemyManager(ENEMIES, new EventBus<GameEvents>());
  });

  function dyingCount(): number {
    let n = 0;
    for (let i = 0; i < mgr.highWater; i++) {
      if (mgr.aliveFlags[i] && mgr.state[i] === EState.Dying) n++;
    }
    return n;
  }

  it('killed enemies become corpses with the configured TTL', () => {
    const idx = mgr.spawn(grunt, stats, 0, 0, false, 1);
    mgr.kill(idx, true, null);
    expect(mgr.state[idx]).toBe(EState.Dying);
    expect(mgr.deathTimer[idx]).toBe(mgr.corpseTtlSec);
  });

  it('caps simultaneous corpses at the corpse budget, evicting oldest first', () => {
    mgr.setCorpseBudget(5);
    const idxs: number[] = [];
    for (let i = 0; i < 12; i++) idxs.push(mgr.spawn(grunt, stats, i, 0, false, 1));
    for (const idx of idxs) {
      mgr.deathTimer[idx] = 0; // distinguishable ages
      mgr.kill(idx, true, null);
    }
    expect(dyingCount()).toBeLessThanOrEqual(5);
    // The most recently killed are the survivors.
    for (const idx of idxs.slice(-5)) {
      expect(mgr.state[idx]).toBe(EState.Dying);
      expect(mgr.aliveFlags[idx]).toBe(1);
    }
  });

  it('lowering the budget via setCorpseBudget evicts immediately', () => {
    const idxs: number[] = [];
    for (let i = 0; i < 10; i++) idxs.push(mgr.spawn(grunt, stats, i, 0, false, 1));
    for (const idx of idxs) mgr.kill(idx, true, null);
    expect(dyingCount()).toBe(10);
    mgr.setCorpseBudget(3);
    expect(dyingCount()).toBeLessThanOrEqual(3);
  });

  it('a full manager evicts a corpse to make room for a live spawn', () => {
    const spawned: number[] = [];
    for (let i = 0; i < MAX_ENEMIES; i++) spawned.push(mgr.spawn(grunt, stats, i % 50, Math.floor(i / 50), false, 1));
    expect(spawned.every((i) => i >= 0)).toBe(true);
    // Manager is full; kill one (it becomes a corpse, still occupying a slot).
    mgr.kill(spawned[0], true, null);
    const extra = mgr.spawn(grunt, stats, 0, 0, false, 1);
    expect(extra).toBeGreaterThanOrEqual(0);
  });

  it('corpses never count toward wave-clear detection', () => {
    const idx = mgr.spawn(grunt, stats, 0, 0, false, 3);
    expect(mgr.aliveFromWave(3)).toBe(1);
    mgr.kill(idx, true, null);
    expect(mgr.aliveFromWave(3)).toBe(0);
  });
});
