/**
 * Pure scalar/vector math used by the simulation. No Three.js imports here —
 * the sim layer must stay renderer-agnostic (multiplayer-ready boundary).
 * Hot-path functions take scalars and write into caller-provided outputs to
 * avoid per-frame garbage.
 */

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a);

export const remap = (inMin: number, inMax: number, outMin: number, outMax: number, v: number): number =>
  lerp(outMin, outMax, invLerp(inMin, inMax, v));

/** Frame-rate independent exponential smoothing toward a target. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Wrap an angle into [-PI, PI]. */
export const wrapAngle = (a: number): number => {
  const TWO_PI = Math.PI * 2;
  a = a % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  else if (a < -Math.PI) a += TWO_PI;
  return a;
};

/** Move a value toward target by at most maxDelta. */
export const moveToward = (current: number, target: number, maxDelta: number): number => {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
};

/** base * growth^n — shared curve for XP requirements and enemy scaling. */
export const expCurve = (base: number, growth: number, n: number): number =>
  base * Math.pow(growth, n);

// ---------------------------------------------------------------------------
// XZ-plane helpers (the horde sim is primarily 2.5D on the ground plane)
// ---------------------------------------------------------------------------

export const dist2XZ = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
};

export const lenXZ = (x: number, z: number): number => Math.sqrt(x * x + z * z);

export interface OutXZ {
  x: number;
  z: number;
}

/** Normalize (x,z) into `out`. Zero vectors normalize to (0,0). */
export const normalizeXZ = (x: number, z: number, out: OutXZ): OutXZ => {
  const len = Math.sqrt(x * x + z * z);
  if (len < 1e-8) {
    out.x = 0;
    out.z = 0;
  } else {
    out.x = x / len;
    out.z = z / len;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Intersection tests (scalar args; no allocation)
// ---------------------------------------------------------------------------

/**
 * Ray vs AABB (slab method). Returns entry distance t >= 0, 0 if the origin is
 * inside the box, or null on miss. Direction need not be normalized but t is
 * in units of its length.
 */
export const rayAabb = (
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): number | null => {
  let tmin = -Infinity;
  let tmax = Infinity;

  if (Math.abs(dx) < 1e-12) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - oy) * inv;
    let t2 = (maxY - oy) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  }
  if (Math.abs(dz) < 1e-12) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - oz) * inv;
    let t2 = (maxZ - oz) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
  }

  if (tmax < tmin || tmax < 0) return null;
  return tmin < 0 ? 0 : tmin;
};

/** Ray vs sphere. Returns nearest hit distance t >= 0 or null. */
export const raySphere = (
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  radius: number,
): number | null => {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const dLen2 = dx * dx + dy * dy + dz * dz;
  if (dLen2 < 1e-12) return null;
  const tca = (lx * dx + ly * dy + lz * dz) / Math.sqrt(dLen2);
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const dLen = Math.sqrt(dLen2);
  let t = (tca - thc) / dLen;
  if (t < 0) t = (tca + thc) / dLen;
  if (t < 0) return null;
  return t * dLen / dLen; // t in units of |d|
};

export const sphereAabbOverlap = (
  cx: number, cy: number, cz: number, radius: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): boolean => {
  const nx = clamp(cx, minX, maxX);
  const ny = clamp(cy, minY, maxY);
  const nz = clamp(cz, minZ, maxZ);
  const dx = cx - nx;
  const dy = cy - ny;
  const dz = cz - nz;
  return dx * dx + dy * dy + dz * dz < radius * radius;
};

export const aabbContains = (
  px: number, py: number, pz: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): boolean =>
  px >= minX && px <= maxX && py >= minY && py <= maxY && pz >= minZ && pz <= maxZ;
