import { describe, expect, test } from 'vitest';
import { Rng, hashStringToSeed, dailySeed } from '../src/core/Rng';

describe('Rng', () => {
  test('same seed produces identical sequences (determinism)', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  test('different seeds produce different sequences', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 10 }, () => a.next() === b.next());
    expect(same.every(Boolean)).toBe(false);
  });

  test('next() stays in [0, 1)', () => {
    const r = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('range(min,max) stays in bounds; int(min,max) is inclusive int', () => {
    const r = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const f = r.range(-5, 5);
      expect(f).toBeGreaterThanOrEqual(-5);
      expect(f).toBeLessThan(5);
      const n = r.int(1, 3);
      expect([1, 2, 3]).toContain(n);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  test('pick selects elements from array', () => {
    const r = new Rng(9);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(r.pick(arr));
  });

  test('chance respects probability extremes', () => {
    const r = new Rng(11);
    expect(r.chance(1)).toBe(true);
    expect(r.chance(0)).toBe(false);
  });

  test('fork creates an independent deterministic stream', () => {
    const a = new Rng(100);
    const b = new Rng(100);
    const fa = a.fork('waves');
    const fb = b.fork('waves');
    expect(fa.next()).toBe(fb.next());
    // forking must not disturb determinism of the parent vs an unforked twin
    const c = new Rng(100);
    c.fork('waves');
    const d = new Rng(100);
    d.fork('other');
    expect(c.next()).toBe(d.next());
  });

  test('hashStringToSeed is deterministic and spreads values', () => {
    expect(hashStringToSeed('hello')).toBe(hashStringToSeed('hello'));
    expect(hashStringToSeed('hello')).not.toBe(hashStringToSeed('hellp'));
  });

  test('dailySeed derives a stable seed per calendar day', () => {
    expect(dailySeed(new Date('2026-06-10T08:00:00Z'))).toBe(dailySeed(new Date('2026-06-10T23:00:00Z')));
    expect(dailySeed(new Date('2026-06-10T08:00:00Z'))).not.toBe(dailySeed(new Date('2026-06-11T08:00:00Z')));
  });
});
