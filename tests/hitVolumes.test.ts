/**
 * Hitbox/visual agreement: enemy raycast volumes must match what the player
 * sees. The shared SHAPE_DIMS table is the single source of truth — the
 * renderer's geometry, the sim's capsule raycast, and the debug draw all
 * derive from it. The rusher's visible head must be hittable (and count as
 * a headshot).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { rayVerticalCapsule } from '../src/core/math';
import { SHAPE_DIMS } from '../src/config/shapes';
import { geometryFor } from '../src/render/EnemyRenderer';
import { EventBus } from '../src/core/EventBus';
import { ENEMIES, enemyById } from '../src/config/enemies';
import { EnemyManager } from '../src/sim/enemies/EnemyManager';
import { raycastEnemies, hitVolumeOf } from '../src/sim/enemies/enemyQueries';
import type { GameEvents } from '../src/sim/events';
import type { EnemyShape } from '../src/config/types';

describe('rayVerticalCapsule', () => {
  // Capsule: center (0,0), radius 1, from y=0 to y=4.
  const hit = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) =>
    rayVerticalCapsule(ox, oy, oz, dx, dy, dz, 0, 0, 0, 4, 1);

  it('hits the cylinder side', () => {
    const t = hit(-5, 2, 0, 1, 0, 0);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(4, 1); // enters at x=-1
  });

  it('hits the top cap from above', () => {
    const t = hit(0, 10, 0, 0, -1, 0);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(6, 1); // top of cap at y=4
  });

  it('misses above the top cap when offset sideways', () => {
    expect(hit(-5, 4.9, 0, 1, 0, 0)).toBeNull();
    expect(hit(-5, 3.9, 0, 1, 0, 0)).not.toBeNull(); // inside cap height
  });

  it('misses outside the radius', () => {
    expect(hit(-5, 2, 1.05, 1, 0, 0)).toBeNull();
    expect(hit(-5, 2, 0.95, 1, 0, 0)).not.toBeNull();
  });

  it('returns null for rays pointing away', () => {
    expect(hit(-5, 2, 0, -1, 0, 0)).toBeNull();
  });
});

describe('render geometry agrees with SHAPE_DIMS', () => {
  const shapes: EnemyShape[] = ['capsule', 'sphere', 'box', 'cone', 'crystal'];
  for (const shape of shapes) {
    it(`${shape} bounding box matches the shared dims`, () => {
      const geo = geometryFor(shape);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const height = bb.max.y - bb.min.y;
      const width = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      expect(height).toBeCloseTo(SHAPE_DIMS[shape].height, 1);
      expect(width).toBeCloseTo(SHAPE_DIMS[shape].width, 1);
      geo.dispose();
    });
  }
});

describe('enemy raycast volumes match visible bodies', () => {
  let mgr: EnemyManager;
  const rusher = enemyById('rusher')!;
  const idxArr: number[] = [];
  const tArr: number[] = [];
  const headArr: boolean[] = [];

  beforeEach(() => {
    mgr = new EnemyManager(ENEMIES, new EventBus<GameEvents>());
  });

  function spawnRusherAt(x: number, z: number): number {
    return mgr.spawn(rusher, { hp: rusher.hp, damage: rusher.damage, speed: rusher.speed, scale: rusher.scale, xp: rusher.xp, score: rusher.score }, x, z, false, 1);
  }

  function castAt(y: number, offsetX = 0): number {
    // Ray from z=+10 toward -Z at the given height/lateral offset; target at origin.
    return raycastEnemies(mgr, offsetX, y, 10, 0, 0, -1, 40, idxArr, tArr, headArr);
  }

  it('the full visible rusher body is hittable, including the head', () => {
    const idx = spawnRusherAt(0, 0);
    const vol = hitVolumeOf(mgr, idx);
    const visualHeight = SHAPE_DIMS.capsule.height * rusher.height * rusher.scale;
    expect(vol.yTop).toBeCloseTo(visualHeight, 3);

    // Top of the visible head: hit + headshot.
    expect(castAt(visualHeight - 0.1)).toBeGreaterThan(0);
    expect(headArr[0]).toBe(true);
    // Torso: hit, not a headshot.
    expect(castAt(visualHeight * 0.4)).toBeGreaterThan(0);
    expect(headArr[0]).toBe(false);
    // Above the visible head: clean miss.
    expect(castAt(visualHeight + 0.3)).toBe(0);
  });

  it('width matches the visible silhouette', () => {
    const idx = spawnRusherAt(0, 0);
    const vol = hitVolumeOf(mgr, idx);
    const visualHalfWidth = (SHAPE_DIMS.capsule.width / 2) * rusher.height * rusher.scale;
    expect(vol.radius).toBeCloseTo(visualHalfWidth, 3);
    expect(castAt(1.2, visualHalfWidth - 0.05)).toBeGreaterThan(0);
    expect(castAt(1.2, visualHalfWidth + 0.1)).toBe(0);
  });

  it('headshot band covers the configured top fraction of the visible height', () => {
    const idx = spawnRusherAt(0, 0);
    const vol = hitVolumeOf(mgr, idx);
    const bandStart = vol.yTop * (1 - rusher.headshotZone);
    castAt(bandStart + 0.05);
    expect(headArr[0]).toBe(true);
    castAt(bandStart - 0.15);
    expect(headArr[0]).toBe(false);
    void idx;
  });
});
