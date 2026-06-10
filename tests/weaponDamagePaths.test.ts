/**
 * Weapon damage tuning must cover EVERY damage path of a weapon: hitscan
 * pellets, projectile direct hits, explosive payloads, arc chains, and melee.
 * Launcher blast in particular must respond to tuning and its +25%-blast
 * tier, without double-applying the player's damage multiplier.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { WeaponSim, type FireView } from '../src/sim/weapons';
import { WEAPONS, weaponById } from '../src/config/weapons';
import { ENEMIES, enemyById } from '../src/config/enemies';
import { UPGRADES } from '../src/config/upgrades';
import { BALANCE } from '../src/config/balance';
import { EnemyManager } from '../src/sim/enemies/EnemyManager';
import { computePlayerStats } from '../src/sim/progression/upgradeEffects';
import { RunStats } from '../src/sim/RunStats';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { defaultTuning, type TuningOverrides } from '../src/sim/tuning';
import { PlayerProjectiles } from '../src/sim/projectiles';
import type { GameEvents } from '../src/sim/events';
import type { CombatContext } from '../src/sim/combat/context';
import type { CollisionWorld } from '../src/sim/collision';
import type { Barrels } from '../src/sim/barrels';

const LAUNCHER = weaponById('launcher')!;
const BLAST = LAUNCHER.projectile!.explosive!.damage;

describe('weapon damage paths (P5)', () => {
  let bus: EventBus<GameEvents>;
  let enemies: EnemyManager;
  let tuning: TuningOverrides;
  let weapons: WeaponSim;
  let projectiles: PlayerProjectiles;
  let ctx: CombatContext;
  let playerDamageMult: number;

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    enemies = new EnemyManager(ENEMIES, bus);
    tuning = defaultTuning();
    weapons = new WeaponSim(WEAPONS, ['launcher', 'arccaster'], bus, new Rng(4), tuning);
    projectiles = new PlayerProjectiles();
    playerDamageMult = 1;
    const base = computePlayerStats(BALANCE.player, new Map(), UPGRADES);
    ctx = {
      enemies,
      barrels: { raycast: () => -1, damage: () => {} } as unknown as Barrels,
      collision: { raycast: () => null } as unknown as CollisionWorld,
      bus,
      rng: new Rng(5),
      stats: new RunStats(),
      player: () => ({ ...base, stats: { ...base.stats, damageMult: playerDamageMult } }),
      healPlayer: () => {},
      playerPos: { x: 0, z: 0 },
      damagePlayer: () => {},
    };
  });

  function spawnTough(x: number, z: number): number {
    const cfg = enemyById('rusher')!;
    return enemies.spawn(cfg, { hp: 100_000, damage: 1, speed: 0, scale: 1, xp: 0, score: 0 }, x, z, false, 1);
  }

  /** Fire a launcher grenade that times out at the spawn point (epicenter). */
  function blastDamageAt(idx: number): number {
    const eff = weapons.effective(ctx, LAUNCHER);
    const before = enemies.hp[idx];
    projectiles.spawn(LAUNCHER, enemies.posX[idx], 1, enemies.posZ[idx], 0, 0, -1, eff.damage);
    // Force the timeout-detonation path immediately, at the epicenter.
    projectiles.update(LAUNCHER.projectile!.lifetime + 1, ctx);
    return before - enemies.hp[idx];
  }

  it('baseline blast equals the configured payload (player mult 1, no tiers)', () => {
    const idx = spawnTough(0, -10);
    expect(blastDamageAt(idx)).toBeCloseTo(BLAST, 0);
  });

  it('blast scales with weaponDamageMult.launcher', () => {
    const idx = spawnTough(0, -10);
    tuning.weaponDamageMult.launcher = 2;
    expect(blastDamageAt(idx)).toBeCloseTo(BLAST * 2, 0);
  });

  it('blast scales with the +25%-blast damage tier', () => {
    const idx = spawnTough(0, -10);
    weapons.runtime.get('launcher')!.tier = 1; // HE filler (+25% blast)
    expect(blastDamageAt(idx)).toBeCloseTo(BLAST * 1.25, 0);
  });

  it('player damageMult applies exactly once to blast', () => {
    const idx = spawnTough(0, -10);
    playerDamageMult = 1.5;
    expect(blastDamageAt(idx)).toBeCloseTo(BLAST * 1.5, 0); // not 110 × 1.5²
  });

  it('arccaster direct and chain damage scale with weapon tuning', () => {
    const arc = weaponById('arccaster')!;
    const run = (): { direct: number; chained: number } => {
      const a = spawnTough(0, -6);
      const b = spawnTough(3, -6);
      const eff = weapons.effective(ctx, arc);
      const beforeA = enemies.hp[a];
      const beforeB = enemies.hp[b];
      // Bolt flying straight into A; B is in chain range.
      projectiles.spawn(arc, 0, 1, 0, 0, 0, -1, eff.damage);
      for (let i = 0; i < 60; i++) projectiles.update(1 / 60, ctx);
      const result = { direct: beforeA - enemies.hp[a], chained: beforeB - enemies.hp[b] };
      enemies.freeSlot(a);
      enemies.freeSlot(b);
      return result;
    };
    const base = run();
    expect(base.direct).toBeGreaterThan(0);
    expect(base.chained).toBeGreaterThan(0);
    tuning.weaponDamageMult.arccaster = 2;
    const tuned = run();
    expect(tuned.direct).toBeCloseTo(base.direct * 2, 0);
    expect(tuned.chained).toBeCloseTo(base.chained * 2, 0);
  });

  it('melee damage scales with weapon tuning', () => {
    const machete = WEAPONS.find((w) => w.kind === 'melee')!;
    weapons.currentId = machete.id;
    weapons.switchLeft = 0;
    const view: FireView = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 0, dz: -1 };
    const swing = (): number => {
      const idx = spawnTough(0, -1.8);
      const before = enemies.hp[idx];
      weapons.cooldown = 0;
      weapons.update(1 / 60, { ...neutral(), fire: true, firePressed: true }, view, ctx, projectiles);
      const delta = before - enemies.hp[idx];
      enemies.freeSlot(idx);
      return delta;
    };
    const base = swing();
    tuning.weaponDamageMult[machete.id] = 2;
    expect(swing()).toBeCloseTo(base * 2, 5);
  });
});

function neutral() {
  return {
    moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false,
    fire: false, firePressed: false, aim: false, reload: false,
    weaponSlot: -1, weaponDelta: 0, lookDX: 0, lookDY: 0, interact: false,
  };
}
