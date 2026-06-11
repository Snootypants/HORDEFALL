/**
 * Melee weapon: slot 0, cone hit detection with knockback, cooldown,
 * consumes no ammo, and auto-equips when every gun is fully dry.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { WeaponSim, type FireView } from '../src/sim/weapons';
import { WEAPONS } from '../src/config/weapons';
import { ENEMIES, enemyById } from '../src/config/enemies';
import { UPGRADES } from '../src/config/upgrades';
import { BALANCE } from '../src/config/balance';
import { EnemyManager } from '../src/sim/enemies/EnemyManager';
import { computePlayerStats } from '../src/sim/progression/upgradeEffects';
import { RunStats } from '../src/sim/RunStats';
import { EventBus } from '../src/core/EventBus';
import { Rng } from '../src/core/Rng';
import { neutralInput, type InputCommand } from '../src/sim/inputCommand';
import { PlayerProjectiles } from '../src/sim/projectiles';
import type { GameEvents } from '../src/sim/events';
import type { CombatContext } from '../src/sim/combat/context';
import type { CollisionWorld } from '../src/sim/collision';
import type { Barrels } from '../src/sim/barrels';

const MELEE = WEAPONS.find((w) => w.kind === 'melee')!;
const DT = 1 / 60;

describe('melee weapon', () => {
  let bus: EventBus<GameEvents>;
  let enemies: EnemyManager;
  let weapons: WeaponSim;
  let ctx: CombatContext;
  let view: FireView;
  let projectiles: PlayerProjectiles;

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    enemies = new EnemyManager(ENEMIES, bus);
    weapons = new WeaponSim(WEAPONS, [], bus, new Rng(5));
    projectiles = new PlayerProjectiles();
    const playerStats = computePlayerStats(BALANCE.player, new Map(), UPGRADES);
    ctx = {
      enemies,
      barrels: { raycast: () => -1, damage: () => {} } as unknown as Barrels,
      collision: { raycast: () => null } as unknown as CollisionWorld,
      bus,
      rng: new Rng(6),
      stats: new RunStats(),
      player: () => playerStats,
      healPlayer: () => {},
      playerPos: { x: 0, z: 0 },
      damagePlayer: () => {},
    };
    // Eye at origin looking down -Z.
    view = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 0, dz: -1 };
  });

  function spawnRusher(x: number, z: number): number {
    const cfg = enemyById('rusher')!;
    return enemies.spawn(cfg, { hp: cfg.hp, damage: cfg.damage, speed: cfg.speed, scale: cfg.scale, xp: cfg.xp, score: cfg.score }, x, z, false, 1);
  }

  function swing(cmd?: Partial<InputCommand>): void {
    const input = { ...neutralInput(), fire: true, firePressed: true, ...cmd };
    weapons.update(DT, input, view, ctx, projectiles);
  }

  it('the melee weapon exists at slot 0 and is unlocked by default', () => {
    expect(MELEE).toBeDefined();
    expect(MELEE.slot).toBe(0);
    expect(MELEE.unlockedByDefault).toBe(true);
    expect(MELEE.melee).toBeDefined();
  });

  it('switches to melee on weapon slot 0 command', () => {
    expect(weapons.currentId).not.toBe(MELEE.id);
    weapons.update(DT, { ...neutralInput(), weaponSlot: 0 }, view, ctx, projectiles);
    expect(weapons.currentId).toBe(MELEE.id);
  });

  it('weaponSlot -1 (no request) does not switch', () => {
    const before = weapons.currentId;
    weapons.update(DT, neutralInput(), view, ctx, projectiles);
    expect(weapons.currentId).toBe(before);
  });

  it('hits enemies inside the cone, not behind or out of range', () => {
    weapons.update(DT, { ...neutralInput(), weaponSlot: 0 }, view, ctx, projectiles);
    weapons.switchLeft = 0; // skip the switch delay for the test

    const inFront = spawnRusher(0, -1.8);
    const behind = spawnRusher(0, 2);
    const tooFar = spawnRusher(0, -(MELEE.melee!.range + 4));
    const hpBefore = enemies.hp[inFront];

    swing();

    expect(enemies.hp[inFront]).toBeLessThan(hpBefore);
    expect(enemies.hp[behind]).toBe(enemies.maxHp[behind]);
    expect(enemies.hp[tooFar]).toBe(enemies.maxHp[tooFar]);
  });

  it('knocks hit enemies back away from the player', () => {
    weapons.update(DT, { ...neutralInput(), weaponSlot: 0 }, view, ctx, projectiles);
    weapons.switchLeft = 0;
    const idx = spawnRusher(0, -1.8);
    swing();
    expect(enemies.velZ[idx]).toBeLessThan(0); // pushed further along -Z
  });

  it('respects its cooldown', () => {
    weapons.update(DT, { ...neutralInput(), weaponSlot: 0 }, view, ctx, projectiles);
    weapons.switchLeft = 0;
    const idx = spawnRusher(0, -1.8);
    const hp0 = enemies.hp[idx];
    swing();
    const hp1 = enemies.hp[idx];
    expect(hp1).toBeLessThan(hp0);
    swing(); // immediately again — still cooling down
    expect(enemies.hp[idx]).toBe(hp1);
    // Tick past the cooldown, then it hits again.
    const cooldownTicks = Math.ceil((60 / MELEE.rpm) / DT) + 1;
    for (let i = 0; i < cooldownTicks; i++) {
      weapons.update(DT, neutralInput(), view, ctx, projectiles);
    }
    swing();
    expect(enemies.hp[idx]).toBeLessThan(hp1);
  });

  it('never consumes ammo and never emits weapon:empty', () => {
    let empties = 0;
    bus.on('weapon:empty', () => empties++);
    weapons.update(DT, { ...neutralInput(), weaponSlot: 0 }, view, ctx, projectiles);
    weapons.switchLeft = 0;
    spawnRusher(0, -1.8);
    for (let i = 0; i < 240; i++) {
      weapons.update(DT, { ...neutralInput(), fire: true, firePressed: i % 10 === 0 }, view, ctx, projectiles);
    }
    expect(weapons.state(MELEE.id).mag).toBe(0); // melee has no mag at all
    expect(empties).toBe(0);
    expect(ctx.stats.shotsFired).toBeGreaterThan(2); // swings recorded
  });

  it('auto-equips melee when every gun is fully out of ammo', () => {
    expect(weapons.currentId).toBe('pistol');
    for (const w of WEAPONS) {
      if (w.kind === 'melee') continue;
      const rt = weapons.state(w.id);
      rt.mag = 0;
      rt.reserve = 0;
    }
    let switched = '';
    bus.on('weapon:switched', (e) => { switched = e.weaponId; });
    weapons.update(DT, neutralInput(), view, ctx, projectiles);
    expect(weapons.currentId).toBe(MELEE.id);
    expect(switched).toBe(MELEE.id);
  });

  it('does not auto-equip while any gun still has ammo', () => {
    const rt = weapons.state('pistol');
    rt.mag = 0;
    rt.reserve = 1;
    weapons.update(DT, neutralInput(), view, ctx, projectiles);
    expect(weapons.currentId).toBe('pistol');
  });
});

describe('weapon cycling skips melee (fixes2 P4)', () => {
  let bus2: EventBus<GameEvents>;
  let weapons2: WeaponSim;
  let ctx2: CombatContext;
  const view2: FireView = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 0, dz: -1 };
  const proj = new PlayerProjectiles();

  beforeEach(() => {
    bus2 = new EventBus<GameEvents>();
    const playerStats = computePlayerStats(BALANCE.player, new Map(), UPGRADES);
    // pistol (slot 1) + shotgun (slot 2) unlocked alongside the machete.
    weapons2 = new WeaponSim(WEAPONS, ['shotgun'], bus2, new Rng(7));
    ctx2 = {
      enemies: new EnemyManager(ENEMIES, bus2),
      barrels: { raycast: () => -1, damage: () => {} } as unknown as Barrels,
      collision: { raycast: () => null } as unknown as CollisionWorld,
      bus: bus2,
      rng: new Rng(8),
      stats: new RunStats(),
      player: () => playerStats,
      healPlayer: () => {},
      playerPos: { x: 0, z: 0 },
      damagePlayer: () => {},
    };
  });

  function cycle(delta: 1 | -1): void {
    weapons2.update(DT, { ...neutralInput(), weaponDelta: delta }, view2, ctx2, proj);
    weapons2.switchLeft = 0;
  }

  it('wraps between guns without passing through melee', () => {
    expect(weapons2.currentId).toBe('pistol');
    cycle(1);
    expect(weapons2.currentId).toBe('shotgun');
    cycle(1); // wraps: shotgun → pistol, NOT machete
    expect(weapons2.currentId).toBe('pistol');
    cycle(-1); // wraps backward: pistol → shotgun, NOT machete
    expect(weapons2.currentId).toBe('shotgun');
  });

  it('cycling from melee returns to a gun, respecting direction', () => {
    weapons2.update(DT, { ...neutralInput(), weaponSlot: 0 }, view2, ctx2, proj);
    weapons2.switchLeft = 0;
    expect(weapons2.currentId).toBe(MELEE.id);
    cycle(1);
    expect(weapons2.currentId).toBe('pistol'); // next → lowest gun slot
    weapons2.update(DT, { ...neutralInput(), weaponSlot: 0 }, view2, ctx2, proj);
    weapons2.switchLeft = 0;
    cycle(-1);
    expect(weapons2.currentId).toBe('shotgun'); // prev → highest gun slot
  });

  it('with every gun dry, cycling does not escape melee into an empty gun', () => {
    for (const w of WEAPONS) {
      if (w.kind === 'melee') continue;
      const rt = weapons2.state(w.id);
      rt.mag = 0;
      rt.reserve = 0;
    }
    weapons2.update(DT, neutralInput(), view2, ctx2, proj); // auto-equips melee
    expect(weapons2.currentId).toBe(MELEE.id);
    // Stage 2 carryover: staying on melee must be silent — no transient
    // switch to a dry gun and back (no extra weapon:switched events).
    let switches = 0;
    bus2.on('weapon:switched', () => switches++);
    cycle(1);
    expect(weapons2.currentId).toBe(MELEE.id);
    cycle(-1);
    expect(weapons2.currentId).toBe(MELEE.id);
    expect(switches).toBe(0);
  });

  it('slot 0 still equips melee directly', () => {
    weapons2.update(DT, { ...neutralInput(), weaponSlot: 0 }, view2, ctx2, proj);
    expect(weapons2.currentId).toBe(MELEE.id);
  });
});
