import { describe, expect, test } from 'vitest';
import {
  clamp, lerp, invLerp, remap, damp, wrapAngle, moveToward,
  dist2XZ, lenXZ, normalizeXZ, rayAabb, raySphere, sphereAabbOverlap,
  aabbContains, expCurve,
} from '../src/core/math';

describe('scalar math', () => {
  test('clamp bounds values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  test('lerp interpolates and invLerp inverts it', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(invLerp(0, 10, 5)).toBe(0.5);
    expect(invLerp(5, 5, 5)).toBe(0); // degenerate range guarded
  });

  test('remap maps between ranges', () => {
    expect(remap(0, 10, 100, 200, 5)).toBe(150);
  });

  test('damp is frame-rate independent smoothing', () => {
    // Two 0.5s steps should land near one 1.0s step
    let a = damp(0, 100, 4, 1.0);
    let b = damp(0, 100, 4, 0.5);
    b = damp(b, 100, 4, 0.5);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });

  test('wrapAngle keeps angles in [-PI, PI]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 5);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI * 0.5, 5);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 5);
  });

  test('moveToward advances by at most maxDelta', () => {
    expect(moveToward(0, 10, 3)).toBe(3);
    expect(moveToward(9, 10, 3)).toBe(10);
    expect(moveToward(10, 0, 3)).toBe(7);
  });

  test('expCurve grows exponentially from base', () => {
    expect(expCurve(100, 1.15, 0)).toBeCloseTo(100);
    expect(expCurve(100, 1.15, 2)).toBeCloseTo(100 * 1.15 * 1.15);
  });
});

describe('vector helpers (XZ plane)', () => {
  test('dist2XZ computes squared distance on XZ plane ignoring Y', () => {
    expect(dist2XZ(0, 0, 3, 4)).toBe(25);
  });

  test('lenXZ and normalizeXZ', () => {
    expect(lenXZ(3, 4)).toBe(5);
    const out = { x: 0, z: 0 };
    normalizeXZ(3, 4, out);
    expect(out.x).toBeCloseTo(0.6);
    expect(out.z).toBeCloseTo(0.8);
    normalizeXZ(0, 0, out); // zero vector guarded
    expect(out.x).toBe(0);
    expect(out.z).toBe(0);
  });
});

describe('intersection tests', () => {
  test('rayAabb hits a box in front and returns entry distance', () => {
    const t = rayAabb(0, 0, 0, 0, 0, 1, -1, -1, 4, 1, 1, 6);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(4);
  });

  test('rayAabb misses a box behind the origin', () => {
    const t = rayAabb(0, 0, 0, 0, 0, 1, -1, -1, -6, 1, 1, -4);
    expect(t).toBeNull();
  });

  test('rayAabb hits when origin is inside the box', () => {
    const t = rayAabb(0, 0, 0, 0, 0, 1, -1, -1, -1, 1, 1, 1);
    expect(t).not.toBeNull();
    expect(t!).toBe(0);
  });

  test('raySphere returns hit distance or null', () => {
    expect(raySphere(0, 0, 0, 0, 0, 1, 0, 0, 5, 1)).toBeCloseTo(4);
    expect(raySphere(0, 0, 0, 0, 0, 1, 10, 0, 5, 1)).toBeNull();
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, 5, 1)).toBeNull(); // behind
  });

  test('sphereAabbOverlap detects overlap and separation', () => {
    expect(sphereAabbOverlap(0, 0, 0, 1.1, -3, -3, 1, 3, 3, 3)).toBe(true);
    expect(sphereAabbOverlap(0, 0, 0, 0.9, -3, -3, 1, 3, 3, 3)).toBe(false);
  });

  test('aabbContains checks point membership', () => {
    expect(aabbContains(0, 0, 0, -1, -1, -1, 1, 1, 1)).toBe(true);
    expect(aabbContains(2, 0, 0, -1, -1, -1, 1, 1, 1)).toBe(false);
  });
});
