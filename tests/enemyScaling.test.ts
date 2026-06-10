import { describe, expect, test } from 'vitest';
import { scaleEnemy, scaleBoss } from '../src/sim/enemies/scaling';
import { ENEMIES, BOSS_ID, enemyById } from '../src/config/enemies';
import { BALANCE } from '../src/config/balance';

const rusher = enemyById('rusher')!;
const boss = enemyById(BOSS_ID)!;
const cfg = BALANCE.enemyScaling;

describe('scaleEnemy', () => {
  test('wave 1 non-elite equals base stats', () => {
    const s = scaleEnemy(rusher, 1, cfg, false);
    expect(s.hp).toBeCloseTo(rusher.hp);
    expect(s.damage).toBeCloseTo(rusher.damage);
    expect(s.speed).toBeCloseTo(rusher.speed);
  });

  test('hp and damage grow monotonically with wave', () => {
    let prevHp = 0;
    let prevDmg = 0;
    for (let wave = 1; wave <= 20; wave++) {
      const s = scaleEnemy(rusher, wave, cfg, false);
      expect(s.hp).toBeGreaterThan(prevHp);
      expect(s.damage).toBeGreaterThanOrEqual(prevDmg);
      prevHp = s.hp;
      prevDmg = s.damage;
    }
  });

  test('speed growth is capped at speedCap', () => {
    const s = scaleEnemy(rusher, 999, cfg, false);
    expect(s.speed).toBeLessThanOrEqual(rusher.speed * cfg.speedCap + 1e-9);
  });

  test('elites multiply hp/damage and scale', () => {
    const normal = scaleEnemy(rusher, 5, cfg, false);
    const elite = scaleEnemy(rusher, 5, cfg, true);
    expect(elite.hp).toBeCloseTo(normal.hp * cfg.eliteHpMult);
    expect(elite.damage).toBeCloseTo(normal.damage * cfg.eliteDamageMult);
    expect(elite.scale).toBeGreaterThan(normal.scale);
  });

  test('xp and score rise with wave', () => {
    const w1 = scaleEnemy(rusher, 1, cfg, false);
    const w10 = scaleEnemy(rusher, 10, cfg, false);
    expect(w10.xp).toBeGreaterThan(w1.xp);
    expect(w10.score).toBeGreaterThan(w1.score);
  });

  test('all roster enemies scale without NaN at deep waves', () => {
    for (const e of ENEMIES) {
      const s = scaleEnemy(e, 50, cfg, true);
      for (const v of [s.hp, s.damage, s.speed, s.scale, s.xp, s.score]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('scaleBoss', () => {
  test('boss hp grows with each boss number', () => {
    const b1 = scaleBoss(boss, 1, cfg);
    const b2 = scaleBoss(boss, 2, cfg);
    expect(b1.hp).toBeCloseTo(boss.hp);
    expect(b2.hp).toBeGreaterThan(b1.hp);
  });
});
