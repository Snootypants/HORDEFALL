import { describe, expect, test } from 'vitest';
import { computeHitDamage, applyDamageToDefenses } from '../src/sim/combat/damage';

const base = {
  baseDamage: 100,
  distance: 0,
  falloffStart: 30,
  range: 100,
  falloffMinMult: 0.5,
  isHeadshot: false,
  headshotMult: 2,
  damageMult: 1,
  critChance: 0,
  critMult: 2,
  critRoll: 0.99,
};

describe('computeHitDamage', () => {
  test('full damage inside falloffStart', () => {
    const r = computeHitDamage({ ...base, distance: 10 });
    expect(r.damage).toBe(100);
    expect(r.isCrit).toBe(false);
  });

  test('linear falloff between falloffStart and range, floored at minMult', () => {
    const mid = computeHitDamage({ ...base, distance: 65 }); // halfway through falloff band
    expect(mid.damage).toBeCloseTo(75);
    const far = computeHitDamage({ ...base, distance: 100 });
    expect(far.damage).toBeCloseTo(50);
    const past = computeHitDamage({ ...base, distance: 500 });
    expect(past.damage).toBeCloseTo(50);
  });

  test('headshot multiplies damage', () => {
    const r = computeHitDamage({ ...base, isHeadshot: true });
    expect(r.damage).toBe(200);
  });

  test('crit applies when roll is under critChance', () => {
    const crit = computeHitDamage({ ...base, critChance: 0.5, critRoll: 0.4 });
    expect(crit.isCrit).toBe(true);
    expect(crit.damage).toBe(200);
    const noCrit = computeHitDamage({ ...base, critChance: 0.5, critRoll: 0.6 });
    expect(noCrit.isCrit).toBe(false);
    expect(noCrit.damage).toBe(100);
  });

  test('headshot, crit, damageMult and weak point all stack multiplicatively', () => {
    const r = computeHitDamage({
      ...base,
      isHeadshot: true,
      critChance: 1,
      critRoll: 0,
      damageMult: 1.5,
      weakPointMult: 3,
    });
    // 100 * 2 (head) * 2 (crit) * 1.5 (stats) * 3 (weak point)
    expect(r.damage).toBe(1800);
  });

  test('damage is never negative', () => {
    const r = computeHitDamage({ ...base, baseDamage: 0.0001, damageMult: 0 });
    expect(r.damage).toBeGreaterThanOrEqual(0);
  });
});

describe('applyDamageToDefenses (player armor model)', () => {
  test('armor absorbs its share while it lasts', () => {
    const r = applyDamageToDefenses(100, 50, 30, 0.66);
    // absorbed = 30 * 0.66 = 19.8 -> armor 30.2, health takes 10.2
    expect(r.armor).toBeCloseTo(30.2);
    expect(r.health).toBeCloseTo(89.8);
  });

  test('armor depletion spills the remainder to health', () => {
    const r = applyDamageToDefenses(100, 5, 30, 0.66);
    // armor can only absorb 5: health takes 25
    expect(r.armor).toBe(0);
    expect(r.health).toBeCloseTo(75);
  });

  test('no armor means full damage to health', () => {
    const r = applyDamageToDefenses(100, 0, 30, 0.66);
    expect(r.health).toBe(70);
  });

  test('health never drops below 0', () => {
    const r = applyDamageToDefenses(10, 0, 500, 0.66);
    expect(r.health).toBe(0);
  });
});
