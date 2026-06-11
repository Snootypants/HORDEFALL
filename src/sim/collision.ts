/**
 * Static world collision: raycasts, line-of-sight, capsule move-and-slide
 * with step-up, and 2D circle pushout for enemies. The box count per arena is
 * modest (≈100–200), so raycasts iterate a coarse XZ bucket grid; movement
 * queries use the same buckets.
 */

import type { MapData, StaticBox } from './mapGen';
import { rayAabb, clamp } from '../core/math';

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  boxIndex: number;
}

export interface CapsuleBody {
  x: number;
  y: number; // feet
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  grounded: boolean;
}

const BUCKET = 8;

export class CollisionWorld {
  readonly boxes: StaticBox[];
  private readonly half: number;
  private readonly buckets = new Map<number, number[]>();
  private readonly scratchHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0, boxIndex: -1 };
  private readonly candidateScratch: number[] = [];

  constructor(map: MapData) {
    this.boxes = map.boxes;
    this.half = map.config.size / 2 + 4;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      const minCx = Math.floor(b.minX / BUCKET);
      const maxCx = Math.floor(b.maxX / BUCKET);
      const minCz = Math.floor(b.minZ / BUCKET);
      const maxCz = Math.floor(b.maxZ / BUCKET);
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = (cx + 1024) * 4096 + (cz + 1024);
          let arr = this.buckets.get(key);
          if (!arr) {
            arr = [];
            this.buckets.set(key, arr);
          }
          arr.push(i);
        }
      }
    }
  }

  /** Collect candidate box indices near an XZ region into a scratch array. */
  private candidates(minX: number, minZ: number, maxX: number, maxZ: number): number[] {
    const out = this.candidateScratch;
    out.length = 0;
    const minCx = Math.floor(minX / BUCKET);
    const maxCx = Math.floor(maxX / BUCKET);
    const minCz = Math.floor(minZ / BUCKET);
    const maxCz = Math.floor(maxZ / BUCKET);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const arr = this.buckets.get((cx + 1024) * 4096 + (cz + 1024));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          if (out.indexOf(arr[i]) === -1) out.push(arr[i]);
        }
      }
    }
    return out;
  }

  /**
   * Nearest ray hit against world boxes (and the ground plane y=0).
   * Returns a reused scratch object — copy fields if you must keep them.
   */
  raycast(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number,
  ): RayHit | null {
    let bestT = maxDist;
    let bestBox = -1;

    // Ground plane
    if (dy < -1e-9 && oy > 0) {
      const t = -oy / dy;
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestBox = -2; // ground
      }
    }

    // Boxes along the ray — coarse: candidates from the swept XZ AABB.
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const cands = this.candidates(
      Math.min(ox, ex) - 1, Math.min(oz, ez) - 1,
      Math.max(ox, ex) + 1, Math.max(oz, ez) + 1,
    );
    for (let ci = 0; ci < cands.length; ci++) {
      const i = cands[ci];
      const b = this.boxes[i];
      const t = rayAabb(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
      if (t !== null && t < bestT) {
        bestT = t;
        bestBox = i;
      }
    }

    if (bestBox === -1 && bestT >= maxDist) return null;

    const hit = this.scratchHit;
    hit.t = bestT;
    hit.boxIndex = bestBox;
    // Normal from the dominant penetrated face
    if (bestBox === -2) {
      hit.nx = 0; hit.ny = 1; hit.nz = 0;
    } else if (bestBox >= 0) {
      const b = this.boxes[bestBox];
      const px = ox + dx * bestT;
      const py = oy + dy * bestT;
      const pz = oz + dz * bestT;
      const dxMin = Math.abs(px - b.minX);
      const dxMax = Math.abs(px - b.maxX);
      const dyMin = Math.abs(py - b.minY);
      const dyMax = Math.abs(py - b.maxY);
      const dzMin = Math.abs(pz - b.minZ);
      const dzMax = Math.abs(pz - b.maxZ);
      const m = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);
      hit.nx = m === dxMin ? -1 : m === dxMax ? 1 : 0;
      hit.ny = m === dyMin ? -1 : m === dyMax ? 1 : 0;
      hit.nz = m === dzMin ? -1 : m === dzMax ? 1 : 0;
    } else {
      return null;
    }
    return hit;
  }

  /** True when a straight segment between two points is blocked by world geometry. */
  losBlocked(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-6) return false;
    const hit = this.raycast(x0, y0, z0, dx / dist, dy / dist, dz / dist, dist);
    return hit !== null && hit.t < dist - 0.05;
  }

  /**
   * Move a capsule (feet at body.y) with gravity, wall slide, step-up, and
   * landing on box tops. Mutates `body` in place.
   */
  moveCapsule(body: CapsuleBody, radius: number, height: number, dt: number, stepHeight: number): void {
    // Horizontal — X then Z, with pushout + step-up.
    body.x += body.velX * dt;
    this.resolveHorizontal(body, radius, height, stepHeight, true);
    body.z += body.velZ * dt;
    this.resolveHorizontal(body, radius, height, stepHeight, false);

    // Clamp to arena bounds as a safety net (walls should catch first).
    body.x = clamp(body.x, -this.half, this.half);
    body.z = clamp(body.z, -this.half, this.half);

    // Vertical
    body.y += body.velY * dt;
    body.grounded = false;
    if (body.y <= 0) {
      body.y = 0;
      if (body.velY < 0) body.velY = 0;
      body.grounded = true;
    } else if (body.velY <= 0) {
      // Land on box tops we overlap in XZ.
      const cands = this.candidates(body.x - radius, body.z - radius, body.x + radius, body.z + radius);
      for (let ci = 0; ci < cands.length; ci++) {
        const b = this.boxes[cands[ci]];
        if (
          body.x + radius > b.minX && body.x - radius < b.maxX &&
          body.z + radius > b.minZ && body.z - radius < b.maxZ
        ) {
          if (body.y <= b.maxY && body.y > b.maxY - 1.0) {
            body.y = b.maxY;
            body.velY = 0;
            body.grounded = true;
            break;
          }
        }
      }
    }
    // Head bump
    if (body.velY > 0) {
      const cands = this.candidates(body.x - radius, body.z - radius, body.x + radius, body.z + radius);
      for (let ci = 0; ci < cands.length; ci++) {
        const b = this.boxes[cands[ci]];
        if (
          body.x + radius > b.minX && body.x - radius < b.maxX &&
          body.z + radius > b.minZ && body.z - radius < b.maxZ &&
          body.y + height > b.minY && body.y < b.minY
        ) {
          body.velY = 0;
          break;
        }
      }
    }
  }

  private resolveHorizontal(
    body: CapsuleBody,
    radius: number,
    height: number,
    stepHeight: number,
    axisX: boolean,
  ): void {
    const cands = this.candidates(body.x - radius, body.z - radius, body.x + radius, body.z + radius);
    for (let ci = 0; ci < cands.length; ci++) {
      const b = this.boxes[cands[ci]];
      // Vertical overlap? (capsule occupies [y, y+height])
      if (body.y + height <= b.minY || body.y >= b.maxY) continue;
      // XZ overlap with expanded box
      const ex0 = b.minX - radius;
      const ex1 = b.maxX + radius;
      const ez0 = b.minZ - radius;
      const ez1 = b.maxZ + radius;
      if (body.x <= ex0 || body.x >= ex1 || body.z <= ez0 || body.z >= ez1) continue;

      // Step-up: low obstacle and we're on/near the ground.
      if (b.maxY - body.y <= stepHeight && b.maxY - body.y > 0) {
        // Check headroom before stepping
        let blocked = false;
        for (let cj = 0; cj < cands.length; cj++) {
          const other = this.boxes[cands[cj]];
          if (other === b) continue;
          if (
            body.x + radius > other.minX && body.x - radius < other.maxX &&
            body.z + radius > other.minZ && body.z - radius < other.maxZ &&
            b.maxY + height > other.minY && b.maxY < other.maxY
          ) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          body.y = b.maxY;
          continue;
        }
      }

      // Push out along the shallower axis of this collision pass.
      if (axisX) {
        const pushLeft = body.x - ex0;
        const pushRight = ex1 - body.x;
        body.x += pushLeft < pushRight ? -pushLeft : pushRight;
        body.velX = 0;
      } else {
        const pushNear = body.z - ez0;
        const pushFar = ez1 - body.z;
        body.z += pushNear < pushFar ? -pushNear : pushFar;
        body.velZ = 0;
      }
    }
  }

  /**
   * Highest walkable surface under a circle: max box top ≤ maxY among boxes
   * overlapping the circle's XZ footprint; 0 (the ground plane) otherwise.
   */
  groundHeightAt(x: number, z: number, radius: number, maxY: number): number {
    let best = 0;
    const cands = this.candidates(x - radius, z - radius, x + radius, z + radius);
    for (let ci = 0; ci < cands.length; ci++) {
      const b = this.boxes[cands[ci]];
      if (b.maxY > maxY || b.maxY <= best) continue;
      if (x + radius <= b.minX || x - radius >= b.maxX || z + radius <= b.minZ || z - radius >= b.maxZ) continue;
      best = b.maxY;
    }
    return best;
  }

  /**
   * Vertically-aware circle pushout for enemies. Boxes whose top is within
   * stepHeight of the feet are climbable (skipped — ground snap raises the
   * body); anything else overlapping [footY, topY] pushes the circle out,
   * so a body too tall to fit under a platform bumps into its side instead
   * of clipping through.
   */
  pushOutCircleStepped(pos: { x: number; z: number }, radius: number, footY: number, topY: number, stepHeight: number): boolean {
    let pushed = false;
    const cands = this.candidates(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
    for (let ci = 0; ci < cands.length; ci++) {
      const b = this.boxes[cands[ci]];
      if (b.maxY - footY <= stepHeight) continue; // climbable / walk-over
      if (topY <= b.minY || footY >= b.maxY) continue; // clear above/below
      const nx = clamp(pos.x, b.minX, b.maxX);
      const nz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      pushed = true;
      if (d2 < 1e-9) {
        const exits = [
          { d: pos.x - b.minX + radius, x: -1, z: 0 },
          { d: b.maxX - pos.x + radius, x: 1, z: 0 },
          { d: pos.z - b.minZ + radius, x: 0, z: -1 },
          { d: b.maxZ - pos.z + radius, x: 0, z: 1 },
        ];
        exits.sort((a, b2) => a.d - b2.d);
        pos.x += exits[0].x * exits[0].d;
        pos.z += exits[0].z * exits[0].d;
      } else {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      }
    }
    return pushed;
  }

  /**
   * 2D circle pushout for ground enemies (cheap, ignores Y except band check).
   * Returns true if any pushout happened (used for steering "blocked" hints).
   */
  pushOutCircle(pos: { x: number; z: number }, radius: number, yBottom: number, yTop: number): boolean {
    let pushed = false;
    const cands = this.candidates(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
    for (let ci = 0; ci < cands.length; ci++) {
      const b = this.boxes[cands[ci]];
      if (yTop <= b.minY || yBottom >= b.maxY - 0.3) continue; // can walk over low boxes
      const nx = clamp(pos.x, b.minX, b.maxX);
      const nz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      pushed = true;
      if (d2 < 1e-9) {
        // Center inside the box — push along smallest exit
        const exits = [
          { d: pos.x - b.minX + radius, x: -1, z: 0 },
          { d: b.maxX - pos.x + radius, x: 1, z: 0 },
          { d: pos.z - b.minZ + radius, x: 0, z: -1 },
          { d: b.maxZ - pos.z + radius, x: 0, z: 1 },
        ];
        exits.sort((a, b2) => a.d - b2.d);
        pos.x += exits[0].x * exits[0].d;
        pos.z += exits[0].z * exits[0].d;
      } else {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      }
    }
    return pushed;
  }
}
