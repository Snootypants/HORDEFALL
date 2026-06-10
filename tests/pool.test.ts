import { describe, expect, test } from 'vitest';
import { ObjectPool } from '../src/core/ObjectPool';

interface Bullet {
  x: number;
  alive: boolean;
}

const makePool = (max = 8) =>
  new ObjectPool<Bullet>({
    name: 'bullets',
    create: () => ({ x: 0, alive: false }),
    reset: (b) => {
      b.x = 0;
      b.alive = false;
    },
    initialSize: 2,
    maxSize: max,
  });

describe('ObjectPool', () => {
  test('prewarms initialSize objects', () => {
    const pool = makePool();
    expect(pool.stats().free).toBe(2);
    expect(pool.stats().created).toBe(2);
  });

  test('acquire returns an object and tracks inUse', () => {
    const pool = makePool();
    const b = pool.acquire();
    expect(b).not.toBeNull();
    expect(pool.stats().inUse).toBe(1);
  });

  test('release recycles: same object is reused after release', () => {
    const pool = makePool();
    const a = pool.acquire()!;
    a.x = 99;
    a.alive = true;
    pool.release(a);
    const b = pool.acquire()!;
    expect(b).toBe(a); // recycled, not newly allocated
    expect(b.x).toBe(0); // reset was applied
    expect(b.alive).toBe(false);
  });

  test('grows past initialSize up to maxSize then returns null', () => {
    const pool = makePool(3);
    const got = [pool.acquire(), pool.acquire(), pool.acquire()];
    expect(got.every((g) => g !== null)).toBe(true);
    expect(pool.acquire()).toBeNull(); // capped
    expect(pool.stats().created).toBe(3);
  });

  test('double release is ignored', () => {
    const pool = makePool();
    const a = pool.acquire()!;
    pool.release(a);
    pool.release(a);
    expect(pool.stats().free).toBe(2);
    expect(pool.stats().inUse).toBe(0);
  });

  test('releaseAll returns everything to the pool', () => {
    const pool = makePool();
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.stats().inUse).toBe(0);
  });
});
