/**
 * Procedural arena generation. Emits pure data (AABBs, spawn rings, prop
 * placements) — the render layer builds meshes from this; the sim builds the
 * CollisionWorld from it. Same MapConfig + seed → identical arena.
 */

import type { MapConfig } from '../config/types';
import { Rng } from '../core/Rng';

export type BoxKind = 'wall' | 'crate' | 'pillar' | 'platform' | 'ramp' | 'rock';

export interface StaticBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  kind: BoxKind;
}

export interface BarrelDef {
  id: number;
  x: number;
  z: number;
}

export interface MapData {
  config: MapConfig;
  seed: number;
  boxes: StaticBox[];
  barrels: BarrelDef[];
  /** Enemy spawn candidates around and inside the arena. */
  spawnPoints: { x: number; z: number }[];
  playerSpawn: { x: number; z: number };
  /** Decorative low-risk areas (pickup bias, "safe-ish zones"). */
  safeZones: { x: number; z: number; radius: number }[];
  /** High-density chokepoint hints (danger zones for the minimap). */
  dangerZones: { x: number; z: number; radius: number }[];
}

const box = (
  cx: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  kind: BoxKind,
  y0 = 0,
): StaticBox => ({
  minX: cx - w / 2,
  minY: y0,
  minZ: cz - d / 2,
  maxX: cx + w / 2,
  maxY: y0 + h,
  maxZ: cz + d / 2,
  kind,
});

const overlapsXZ = (a: StaticBox, b: StaticBox, margin: number): boolean =>
  a.minX - margin < b.maxX &&
  a.maxX + margin > b.minX &&
  a.minZ - margin < b.maxZ &&
  a.maxZ + margin > b.minZ;

export function generateMap(config: MapConfig, seed: number): MapData {
  const rng = new Rng(seed);
  const half = config.size / 2;
  const boxes: StaticBox[] = [];
  const playerSpawn = { x: 0, z: 0 };
  const CLEAR_RADIUS = 8; // nothing solid this close to player spawn

  // Perimeter walls
  const t = 1.5; // wall thickness
  boxes.push(box(0, -half - t / 2, config.size + t * 2, config.wallHeight, t, 'wall'));
  boxes.push(box(0, half + t / 2, config.size + t * 2, config.wallHeight, t, 'wall'));
  boxes.push(box(-half - t / 2, 0, t, config.wallHeight, config.size + t * 2, 'wall'));
  boxes.push(box(half + t / 2, 0, t, config.wallHeight, config.size + t * 2, 'wall'));

  const tryPlace = (candidate: StaticBox, margin = 1.2): boolean => {
    const cx = (candidate.minX + candidate.maxX) / 2;
    const cz = (candidate.minZ + candidate.maxZ) / 2;
    const clearance = Math.max(
      Math.abs(candidate.maxX - candidate.minX),
      Math.abs(candidate.maxZ - candidate.minZ),
    ) / 2 + CLEAR_RADIUS;
    if (cx * cx + cz * cz < clearance * clearance) return false;
    if (Math.abs(cx) > half - 3 || Math.abs(cz) > half - 3) return false;
    for (const existing of boxes) {
      if (existing.kind !== 'wall' && overlapsXZ(candidate, existing, margin)) return false;
    }
    boxes.push(candidate);
    return true;
  };

  const placeMany = (count: number, make: () => StaticBox, margin?: number): StaticBox[] => {
    const placed: StaticBox[] = [];
    let attempts = count * 20;
    while (placed.length < count && attempts-- > 0) {
      const candidate = make();
      if (tryPlace(candidate, margin)) placed.push(candidate);
    }
    return placed;
  };

  const randPos = (border = 8) => ({
    x: rng.range(-half + border, half - border),
    z: rng.range(-half + border, half - border),
  });

  // Pillars: tall chokepoint makers, some in loose colonnades
  const pillarCount = rng.int(config.pillarCount[0], config.pillarCount[1]);
  placeMany(pillarCount, () => {
    const p = randPos();
    const w = rng.range(1.6, 3.0);
    return box(p.x, p.z, w, rng.range(4, config.wallHeight), w, 'pillar');
  });

  // Crates: cover, sometimes stacked
  const crateCount = rng.int(config.crateCount[0], config.crateCount[1]);
  const crates = placeMany(crateCount, () => {
    const p = randPos(6);
    const s = rng.range(1.2, 2.4);
    return box(p.x, p.z, s, s, s, 'crate');
  }, 0.4);
  // Stack a second crate on ~30% of them
  for (const c of crates) {
    if (rng.chance(0.3)) {
      const s = (c.maxX - c.minX) * 0.8;
      boxes.push(box((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, s, s, s, 'crate', c.maxY));
    }
  }

  // Platforms with ramp access (verticality)
  const platformCount = rng.int(config.platformCount[0], config.platformCount[1]);
  const PLATFORM_H = 2.4;
  const platforms = placeMany(platformCount, () => {
    const p = randPos(12);
    const w = rng.range(6, 10);
    const d = rng.range(6, 10);
    return {
      ...box(p.x, p.z, w, 0.5, d, 'platform', PLATFORM_H - 0.5),
    };
  }, 3.0);
  // Ramps: staircases of step AABBs leading onto each platform
  for (const p of platforms) {
    const cx = (p.minX + p.maxX) / 2;
    const cz = (p.minZ + p.maxZ) / 2;
    const dir = rng.int(0, 3); // 0 +x, 1 -x, 2 +z, 3 -z
    const steps = 6;
    const stepH = PLATFORM_H / steps;
    const stepLen = 1.1;
    const rampW = 3;
    for (let i = 0; i < steps; i++) {
      const dist = (steps - i) * stepLen;
      const h = stepH * (i + 1);
      let sx = cx;
      let sz = cz;
      const off = (dir === 0 ? 1 : dir === 1 ? -1 : 0) * ((p.maxX - p.minX) / 2 + dist);
      const offZ = (dir === 2 ? 1 : dir === 3 ? -1 : 0) * ((p.maxZ - p.minZ) / 2 + dist);
      sx += off;
      sz += offZ;
      if (Math.abs(sx) > half - 2 || Math.abs(sz) > half - 2) continue;
      boxes.push(
        dir <= 1
          ? box(sx, sz, stepLen, h, rampW, 'ramp')
          : box(sx, sz, rampW, h, stepLen, 'ramp'),
      );
    }
  }

  // Scatter rocks (irregular low cover)
  placeMany(Math.round(pillarCount * 0.7), () => {
    const p = randPos(5);
    return box(p.x, p.z, rng.range(1.5, 3.5), rng.range(0.8, 1.6), rng.range(1.5, 3.5), 'rock');
  });

  // Explosive barrels — sim entities, not static boxes
  const barrels: BarrelDef[] = [];
  const barrelCount = rng.int(config.barrelCount[0], config.barrelCount[1]);
  let barrelAttempts = barrelCount * 20;
  while (barrels.length < barrelCount && barrelAttempts-- > 0) {
    const p = randPos(6);
    if (p.x * p.x + p.z * p.z < CLEAR_RADIUS * CLEAR_RADIUS) continue;
    const probe = box(p.x, p.z, 0.8, 1.1, 0.8, 'crate');
    if (boxes.some((b2) => b2.kind !== 'wall' && overlapsXZ(probe, b2, 0.5))) continue;
    barrels.push({ id: barrels.length, x: p.x, z: p.z });
  }

  // Enemy spawn ring + interior pockets
  const spawnPoints: { x: number; z: number }[] = [];
  const ringR = half - 6;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    spawnPoints.push({ x: Math.cos(a) * ringR, z: Math.sin(a) * ringR });
  }
  for (let i = 0; i < 8; i++) {
    const p = randPos(10);
    if (p.x * p.x + p.z * p.z > 20 * 20) spawnPoints.push(p);
  }

  // Safe-ish zones: platform tops; danger zones: dense pillar clusters
  const safeZones = platforms.map((p) => ({
    x: (p.minX + p.maxX) / 2,
    z: (p.minZ + p.maxZ) / 2,
    radius: Math.max(p.maxX - p.minX, p.maxZ - p.minZ) / 2,
  }));
  const dangerZones = spawnPoints.slice(0, 6).map((s) => ({ x: s.x * 0.8, z: s.z * 0.8, radius: 10 }));

  return {
    config,
    seed,
    boxes,
    barrels,
    spawnPoints,
    playerSpawn,
    safeZones,
    dangerZones,
  };
}
