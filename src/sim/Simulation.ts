/**
 * The headless game simulation: owns every sim system, advances them in a
 * fixed order each tick, and routes cross-system reactions through the event
 * bus. No DOM, no Three.js — this file is what a future authoritative server
 * would run.
 *
 * Tick order: player → weapons → player projectiles → enemies → enemy
 * projectiles → companions → pickups → waves → progression bookkeeping.
 */

import type { MapConfig } from '../config/types';
import { BALANCE } from '../config/balance';
import { ENEMIES, enemyById } from '../config/enemies';
import { WEAPONS } from '../config/weapons';
import { UPGRADES, upgradeById } from '../config/upgrades';
import { WAVE_EVENTS } from '../config/waves';
import { PICKUPS } from '../config/pickups';
import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import type { GameEvents } from './events';
import { generateMap, type MapData } from './mapGen';
import { CollisionWorld } from './collision';
import { PlayerSim } from './playerSim';
import { WeaponSim, type FireView } from './weapons';
import { PlayerProjectiles } from './projectiles';
import { EnemyManager } from './enemies/EnemyManager';
import { updateEnemies, type EnemyUpdateCtx } from './enemies/enemyAI';
import { scaleEnemy } from './enemies/scaling';
import { EnemyProjectiles } from './enemies/enemyProjectiles';
import { WaveDirector } from './waves/WaveDirector';
import { Pickups } from './pickups';
import { Companions } from './companions';
import { Barrels } from './barrels';
import { Progression } from './progression/Progression';
import { computePlayerStats, type ComputedPlayerStats } from './progression/upgradeEffects';
import { RunStats } from './RunStats';
import type { CombatContext } from './combat/context';
import type { InputCommand } from './inputCommand';

export interface SimulationOptions {
  mapConfig: MapConfig;
  seed: number;
  unlockedWeapons?: string[];
}

export class Simulation {
  readonly bus = new EventBus<GameEvents>();
  readonly rng: Rng;
  readonly seed: number;
  readonly map: MapData;
  readonly collision: CollisionWorld;
  readonly player: PlayerSim;
  readonly weapons: WeaponSim;
  readonly playerProjectiles = new PlayerProjectiles();
  readonly enemies: EnemyManager;
  readonly enemyProjectiles = new EnemyProjectiles();
  readonly waves: WaveDirector;
  readonly pickups: Pickups;
  readonly companions = new Companions();
  readonly barrels: Barrels;
  readonly progression = new Progression(BALANCE.progression);
  readonly stats = new RunStats();

  time = 0;
  credits = 0;
  /** Owned upgrade stacks (id → count). */
  readonly upgradeStacks = new Map<string, number>();
  playerStats: ComputedPlayerStats;
  /** Dev toggle: disable AI LOD throttling. */
  aiThrottle = true;
  /** Cost of the enemy update this tick (perf overlay). */
  perfAiMs = 0;

  private readonly combatCtx: CombatContext;
  private readonly enemyCtx: EnemyUpdateCtx;
  private readonly fireView: FireView = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  private readonly forwardScratch = { x: 0, y: 0, z: 0 };

  constructor(opts: SimulationOptions) {
    this.seed = opts.seed;
    this.rng = new Rng(opts.seed);
    this.map = generateMap(opts.mapConfig, opts.mapConfig.seed ^ opts.seed);
    this.collision = new CollisionWorld(this.map);
    this.player = new PlayerSim(BALANCE.player, this.bus, this.map.playerSpawn.x, this.map.playerSpawn.z);
    this.weapons = new WeaponSim(WEAPONS, opts.unlockedWeapons ?? [], this.bus, this.rng.fork('weapons'));
    this.enemies = new EnemyManager(ENEMIES, this.bus);
    this.barrels = new Barrels(this.map.barrels);
    this.pickups = new Pickups(PICKUPS, this.bus);
    this.waves = new WaveDirector({
      balance: BALANCE.waves,
      scaling: BALANCE.enemyScaling,
      enemies: ENEMIES,
      events: WAVE_EVENTS,
      map: this.map,
      bus: this.bus,
      rng: this.rng.fork('waves'),
      mgr: this.enemies,
    });

    this.playerStats = computePlayerStats(BALANCE.player, this.upgradeStacks, UPGRADES);
    this.player.statSheet = this.playerStats.stats;

    const damagePlayer = (amount: number, fromX: number, fromZ: number): void => {
      const dealt = this.player.applyDamage(amount, fromX, fromZ, this.time);
      if (dealt > 0) {
        this.stats.damageTaken += dealt;
        this.progression.breakStreak();
        // Failsafe Nova: armor break knocks back/stuns nearby enemies.
        if (this.playerStats.flags.has('shieldBurst') && this.player.armor <= 0) {
          this.novaBurst();
        }
      }
    };

    this.combatCtx = {
      enemies: this.enemies,
      barrels: this.barrels,
      collision: this.collision,
      bus: this.bus,
      rng: this.rng.fork('combat'),
      stats: this.stats,
      player: () => this.playerStats,
      healPlayer: (amount) => this.player.heal(amount),
      playerPos: { x: this.player.x, z: this.player.z },
      damagePlayer,
    };

    this.enemyCtx = {
      dt: 0,
      simTime: 0,
      playerX: 0,
      playerY: 0,
      playerZ: 0,
      playerAlive: true,
      collision: this.collision,
      rng: this.rng.fork('enemy-ai'),
      bus: this.bus,
      projectiles: this.enemyProjectiles,
      damagePlayer,
      slowAuraActive: false,
      aiThrottle: true,
    };

    this.enemies.setMinionSpawner((enemyId, x, z, wave) => {
      const cfg = enemyById(enemyId);
      if (!cfg) return;
      const scaled = scaleEnemy(cfg, Math.max(1, wave), BALANCE.enemyScaling, false);
      this.enemies.spawn(cfg, scaled, x, z, false, wave);
    });

    this.wireKillRewards();
  }

  /** XP/score/credits/drops on kills — one subscription, not scattered. */
  private wireKillRewards(): void {
    this.bus.on('enemy:died', (e) => {
      if (!e.killedByPlayer) return;
      this.stats.bossKills += e.isBoss ? 1 : 0;
      const streak = this.progression.registerKill(this.time);
      if (streak) this.bus.emit('player:killstreak', { streak });
      this.progression.addXp(e.xp * this.playerStats.stats.xpGainMult);
      this.progression.addScore(e.score);
      const credits = Math.round(e.currency * this.playerStats.stats.currencyGainMult);
      this.credits += credits;
      this.stats.creditsEarned += credits;
      this.bus.emit('currency:changed', { total: this.credits });
      this.pickups.rollDrop(e.x, e.z, this.rng, BALANCE.economy.dropChance, this.waves.ammoDropMult);
    });
    this.bus.on('pickup:collected', () => {
      this.stats.pickupsCollected++;
    });
    // Subscribed once here (not in startRun) so a re-entrant startRun can
    // never double-deploy turrets.
    this.bus.on('wave:start', () => {
      this.companions.deployTurrets(this.player.x, this.player.z, this.combatCtx);
    });
  }

  startRun(): void {
    this.waves.startRun();
    this.companions.syncCounts(this.playerStats.droneCount, this.playerStats.turretCount);
    this.bus.emit('run:started', { seed: this.seed, mapId: this.map.config.id });
  }

  tick(dt: number, input: InputCommand): void {
    this.time += dt;
    if (this.player.alive) this.stats.timeSurvivedSec = this.time;

    // 1. Player movement
    this.player.update(dt, input, this.collision, this.time);
    this.combatCtx.playerPos.x = this.player.x;
    this.combatCtx.playerPos.z = this.player.z;

    // 2. Weapons (fire from the eye along the view direction)
    this.player.forward(this.forwardScratch);
    this.fireView.ox = this.player.x;
    this.fireView.oy = this.player.eyeY;
    this.fireView.oz = this.player.z;
    this.fireView.dx = this.forwardScratch.x;
    this.fireView.dy = this.forwardScratch.y;
    this.fireView.dz = this.forwardScratch.z;
    if (this.player.alive && this.waves.state !== 'gameover') {
      this.weapons.update(dt, input, this.fireView, this.combatCtx, this.playerProjectiles);
    }

    // 3. Player projectiles
    this.playerProjectiles.update(dt, this.combatCtx);

    // 4. Enemies
    const ectx = this.enemyCtx;
    ectx.dt = dt;
    ectx.simTime = this.time;
    ectx.playerX = this.player.x;
    ectx.playerY = this.player.y;
    ectx.playerZ = this.player.z;
    ectx.playerAlive = this.player.alive;
    ectx.slowAuraActive = this.playerStats.flags.has('slowAura');
    ectx.aiThrottle = this.aiThrottle;
    const aiStart = typeof performance !== 'undefined' ? performance.now() : 0;
    updateEnemies(this.enemies, ectx);
    if (aiStart > 0) this.perfAiMs = performance.now() - aiStart;

    // 5. Enemy projectiles
    this.enemyProjectiles.update(dt, this.collision, this.player, ectx.damagePlayer, this.bus);

    // 6. Companions
    if (this.player.alive) {
      this.companions.update(dt, this.player.x, this.player.y, this.player.z, this.combatCtx);
    }

    // 7. Pickups
    this.pickups.update(dt, this.player, this.playerStats.stats.pickupRadiusMult, {
      heal: (a) => this.player.heal(a),
      addArmor: (a) => this.player.addArmor(a),
      addAmmoFraction: (f) => this.weapons.addAmmoFraction(f),
      addCredits: (a) => {
        const amt = Math.round(a * this.playerStats.stats.currencyGainMult);
        this.credits += amt;
        this.stats.creditsEarned += amt;
        this.bus.emit('currency:changed', { total: this.credits });
      },
    });

    // 8. Waves
    if (!this.player.alive && this.waves.state !== 'gameover') {
      // Dying mid-wave means the current wave wasn't survived.
      const inCombat = this.waves.state === 'spawning' || this.waves.state === 'active';
      this.waves.gameOver();
      this.stats.wavesSurvived = Math.max(0, this.waves.wave - (inCombat ? 1 : 0));
      this.bus.emit('run:gameover', {});
    } else {
      this.waves.update(dt, this.time, this.player, this.progression.level);
      if (this.waves.state === 'break' || this.waves.state === 'idle') {
        this.stats.wavesSurvived = this.waves.wave;
      }
    }

    // 9. Progression housekeeping
    this.progression.tickCombo(this.time);
  }

  /** Level-up choice: add a stack and recompute the live stat sheet. */
  applyUpgrade(id: string): boolean {
    const cfg = upgradeById(id);
    if (!cfg) return false;
    const have = this.upgradeStacks.get(id) ?? 0;
    if (have >= cfg.maxStacks) return false;
    this.upgradeStacks.set(id, have + 1);
    this.stats.upgradesChosen.push(id);
    this.recomputeStats();
    return true;
  }

  recomputeStats(): void {
    const healthFrac = this.player.health / this.player.maxHealth;
    const armorFrac = this.player.maxArmor > 0 ? this.player.armor / this.player.maxArmor : 0;
    this.playerStats = computePlayerStats(BALANCE.player, this.upgradeStacks, UPGRADES);
    this.player.statSheet = this.playerStats.stats;
    // Keep current health/armor proportional when max rises.
    this.player.health = Math.max(this.player.health, healthFrac * this.player.maxHealth);
    this.player.armor = Math.max(this.player.armor, armorFrac * this.player.maxArmor);
    this.companions.syncCounts(this.playerStats.droneCount, this.playerStats.turretCount);
  }

  /** Shield-burst nova: damage + stun in a ring around the player. */
  private novaBurst(): void {
    const radius = 6;
    this.bus.emit('explosion', { x: this.player.x, y: 1, z: this.player.z, radius });
    const hits: number[] = [];
    this.enemies.queryRadius(this.player.x, this.player.z, radius, hits);
    for (const j of hits) {
      this.enemies.applyStatus(j, 'stun');
      this.enemies.applyDamage(j, 25, {
        fromX: this.player.x, fromZ: this.player.z, isHead: false, isCrit: false, byPlayer: true, weaponId: null,
      });
    }
  }

  /**
   * Dev/debug/stress: spawn an enemy at a position, scaled to current wave.
   * Tagged waveTag=-1 (the "no wave" sentinel) so debug spawns never block
   * wave-clear detection.
   */
  debugSpawnEnemy(enemyId: string, x: number, z: number, elite = false): number {
    const cfg = enemyById(enemyId);
    if (!cfg) return -1;
    const wave = Math.max(1, this.waves.wave);
    const scaled = scaleEnemy(cfg, wave, BALANCE.enemyScaling, elite);
    return this.enemies.spawn(cfg, scaled, x, z, elite, -1);
  }
}
