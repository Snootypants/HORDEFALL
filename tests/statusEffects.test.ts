import { describe, expect, test } from 'vitest';
import { StatusStore } from '../src/sim/status';
import { STATUS_EFFECTS, STATUS_INTERACTIONS } from '../src/config/statusEffects';

const make = () => new StatusStore(16, STATUS_EFFECTS, STATUS_INTERACTIONS);

describe('StatusStore', () => {
  test('applying a status makes it active for its duration', () => {
    const s = make();
    s.apply(0, 'burning');
    expect(s.has(0, 'burning')).toBe(true);
    s.tick(0, 3.5); // burning lasts 3.0
    expect(s.has(0, 'burning')).toBe(false);
  });

  test('tick returns dot damage proportional to dps and dt', () => {
    const s = make();
    s.apply(0, 'burning'); // 12 dps
    const dmg = s.tick(0, 1.0);
    expect(dmg).toBeCloseTo(12);
  });

  test('stacks raise dot damage up to maxStacks', () => {
    const s = make();
    s.apply(0, 'poison'); // 6 dps, maxStacks 5
    s.apply(0, 'poison');
    s.apply(0, 'poison');
    expect(s.tick(0, 1.0)).toBeCloseTo(18);
    for (let i = 0; i < 10; i++) s.apply(0, 'poison');
    expect(s.tick(0, 1.0)).toBeCloseTo(30); // capped at 5 stacks
  });

  test('speedMult reflects the strongest slow among active statuses', () => {
    const s = make();
    expect(s.speedMult(0)).toBe(1);
    s.apply(0, 'slow'); // 0.65
    s.apply(0, 'shock'); // 0.7
    expect(s.speedMult(0)).toBeCloseTo(0.65);
  });

  test('stun immobilizes while active', () => {
    const s = make();
    s.apply(0, 'stun');
    expect(s.isStunned(0)).toBe(true);
    expect(s.speedMult(0)).toBe(0);
    s.tick(0, 1.0); // stun is 0.8s
    expect(s.isStunned(0)).toBe(false);
  });

  test('burning + freezing triggers shatter, consuming both', () => {
    const s = make();
    s.apply(0, 'burning');
    const reaction = s.apply(0, 'freezing');
    expect(reaction).not.toBeNull();
    expect(reaction!.result).toBe('shatter');
    expect(reaction!.bonusDamage).toBeGreaterThan(0);
    expect(s.has(0, 'burning')).toBe(false);
    expect(s.has(0, 'freezing')).toBe(false);
  });

  test('interactions are symmetric (freezing then burning also shatters)', () => {
    const s = make();
    s.apply(0, 'freezing');
    const reaction = s.apply(0, 'burning');
    expect(reaction?.result).toBe('shatter');
  });

  test('entities are independent', () => {
    const s = make();
    s.apply(0, 'burning');
    expect(s.has(1, 'burning')).toBe(false);
  });

  test('clear removes everything for an entity (pool recycling)', () => {
    const s = make();
    s.apply(2, 'burning');
    s.apply(2, 'poison');
    s.clear(2);
    expect(s.has(2, 'burning')).toBe(false);
    expect(s.tick(2, 1)).toBe(0);
  });

  test('activeIds lists current statuses without allocation', () => {
    const s = make();
    s.apply(0, 'burning');
    s.apply(0, 'slow');
    const out: string[] = [];
    s.activeIds(0, out);
    expect(out.sort()).toEqual(['burning', 'slow']);
  });
});
