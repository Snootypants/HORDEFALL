import { describe, expect, test } from 'vitest';
import { SpatialHashGrid } from '../src/core/SpatialHashGrid';

describe('SpatialHashGrid', () => {
  test('finds inserted ids within query radius', () => {
    const grid = new SpatialHashGrid(4);
    grid.insert(1, 0, 0);
    grid.insert(2, 3, 0);
    grid.insert(3, 50, 50);
    const out: number[] = [];
    grid.queryCircle(0, 0, 5, out);
    expect(out.sort()).toEqual([1, 2]);
  });

  test('query result excludes ids outside radius even in same cell', () => {
    const grid = new SpatialHashGrid(10);
    grid.insert(1, 0, 0);
    grid.insert(2, 9, 9); // same cell, ~12.7 away
    const out: number[] = [];
    grid.queryCircle(0, 0, 5, out);
    expect(out).toEqual([1]);
  });

  test('update moves an id between cells', () => {
    const grid = new SpatialHashGrid(4);
    grid.insert(1, 0, 0);
    grid.update(1, 40, 40);
    const near: number[] = [];
    grid.queryCircle(0, 0, 5, near);
    expect(near).toEqual([]);
    const far: number[] = [];
    grid.queryCircle(40, 40, 5, far);
    expect(far).toEqual([1]);
  });

  test('remove deletes an id', () => {
    const grid = new SpatialHashGrid(4);
    grid.insert(1, 0, 0);
    grid.remove(1);
    const out: number[] = [];
    grid.queryCircle(0, 0, 5, out);
    expect(out).toEqual([]);
  });

  test('handles negative coordinates', () => {
    const grid = new SpatialHashGrid(4);
    grid.insert(1, -20, -20);
    const out: number[] = [];
    grid.queryCircle(-20, -20, 2, out);
    expect(out).toEqual([1]);
  });

  test('queryCircle reuses the caller array (no allocation contract)', () => {
    const grid = new SpatialHashGrid(4);
    grid.insert(1, 0, 0);
    const out: number[] = [99, 98, 97];
    const n = grid.queryCircle(0, 0, 5, out);
    expect(n).toBe(1);
    expect(out[0]).toBe(1);
    expect(out.length).toBe(1); // truncated, same array instance
  });

  test('clear empties the grid', () => {
    const grid = new SpatialHashGrid(4);
    grid.insert(1, 0, 0);
    grid.insert(2, 1, 1);
    grid.clear();
    const out: number[] = [];
    expect(grid.queryCircle(0, 0, 10, out)).toBe(0);
  });
});
