/**
 * Minimap is a FIXED north-up arena map: world positions project to canvas
 * positions independent of player yaw; only the player arrow rotates. The
 * pure transform lives in src/ui/minimapMath.ts so it is testable headless.
 */

import { describe, expect, it } from 'vitest';
import { worldToMapX, worldToMapY, playerArrowAngle, minimapModel } from '../src/ui/minimapMath';

const SIZE = 168;
const HALF = 65; // world half-extent (130-unit arena)

describe('minimap transform (P1)', () => {
  it('projects world origin to canvas center and corners to edges', () => {
    expect(worldToMapX(0, HALF, SIZE)).toBeCloseTo(SIZE / 2);
    expect(worldToMapY(0, HALF, SIZE)).toBeCloseTo(SIZE / 2);
    expect(worldToMapX(HALF, HALF, SIZE)).toBeCloseTo(SIZE);
    expect(worldToMapX(-HALF, HALF, SIZE)).toBeCloseTo(0);
    // World -Z is "north" — it must map UP the canvas (smaller y).
    expect(worldToMapY(-HALF, HALF, SIZE)).toBeCloseTo(0);
    expect(worldToMapY(HALF, HALF, SIZE)).toBeCloseTo(SIZE);
  });

  it('player yaw does NOT move world markers — only the arrow angle', () => {
    const enemies = [{ x: 20, z: -30 }, { x: -10, z: 5 }];
    const a = minimapModel({ x: 3, z: 4, yaw: 0 }, enemies, HALF, SIZE);
    const b = minimapModel({ x: 3, z: 4, yaw: 2.1 }, enemies, HALF, SIZE);
    expect(b.points).toEqual(a.points); // markers fixed in world space
    expect(b.player.x).toBe(a.player.x);
    expect(b.player.y).toBe(a.player.y);
    expect(b.player.angle).not.toBe(a.player.angle); // facing arrow rotates
  });

  it('moving the player moves the player marker predictably; markers stay put', () => {
    const enemies = [{ x: 20, z: -30 }];
    const a = minimapModel({ x: 0, z: 0, yaw: 0 }, enemies, HALF, SIZE);
    const b = minimapModel({ x: 13, z: -13, yaw: 0 }, enemies, HALF, SIZE);
    expect(b.points).toEqual(a.points); // world markers don't depend on the player
    expect(b.player.x).toBeGreaterThan(a.player.x); // +X → right
    expect(b.player.y).toBeLessThan(a.player.y); // -Z → up
    const px = 13 / (HALF * 2) * SIZE + SIZE / 2;
    expect(b.player.x).toBeCloseTo(px);
  });

  it('yaw 0 (facing -Z / north) points the arrow up', () => {
    expect(playerArrowAngle(0)).toBeCloseTo(0); // canvas arrow drawn pointing up
    // Facing +X (yaw -π/2 with forward = (-sin, -cos)) → arrow points right (+π/2 canvas).
    expect(playerArrowAngle(-Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
