/**
 * Wave flow state machine: break → spawning → active → cleared → break …
 * Owns the spawn queue and the spawn director (point selection that avoids
 * the player's view cone and keeps min/max distance).
 */

import type { EnemyConfig, WaveBalanceConfig, WaveEventConfig, WaveEventId } from '../../config/types';
import type { MapData } from '../mapGen';
import type { GameBus } from '../events';
import type { Rng } from '../../core/Rng';
import type { EnemyManager } from '../enemies/EnemyManager';
import type { EnemyScalingConfig } from '../../config/types';
import { generateWave, type GeneratedWave, type WavePerformance } from './waveGenerator';
import { scaleEnemy, scaleBoss } from '../enemies/scaling';
import { dist2XZ } from '../../core/math';

export type WaveState = 'idle' | 'break' | 'spawning' | 'active' | 'gameover';

interface QueuedSpawn {
  enemyId: string;
  elite: boolean;
}

export class WaveDirector {
  state: WaveState = 'idle';
  wave = 0;
  bossNumber = 0;
  current: GeneratedWave | null = null;
  breakLeft = 0;
  /** Fog/ammo modifiers active this wave (render/drops read these). */
  fogDensityMult = 1;
  ammoDropMult = 1;

  private readonly balance: WaveBalanceConfig;
  private readonly scaling: EnemyScalingConfig;
  private readonly enemies: EnemyConfig[];
  private readonly events: WaveEventConfig[];
  private readonly map: MapData;
  private readonly bus: GameBus;
  private readonly rng: Rng;
  private readonly mgr: EnemyManager;

  private queue: QueuedSpawn[] = [];
  private spawnTimer = 0;
  private waveStartTime = 0;
  private lastPerformance: WavePerformance | null = null;
  private damageAtWaveStart = 0;
  /** Dev tools: force the next wave's event. */
  forcedEventId: WaveEventId | null = null;

  constructor(opts: {
    balance: WaveBalanceConfig;
    scaling: EnemyScalingConfig;
    enemies: EnemyConfig[];
    events: WaveEventConfig[];
    map: MapData;
    bus: GameBus;
    rng: Rng;
    mgr: EnemyManager;
  }) {
    this.balance = opts.balance;
    this.scaling = opts.scaling;
    this.enemies = opts.enemies;
    this.events = opts.events;
    this.map = opts.map;
    this.bus = opts.bus;
    this.rng = opts.rng;
    this.mgr = opts.mgr;
  }

  startRun(): void {
    this.state = 'break';
    this.wave = 0;
    this.bossNumber = 0;
    this.breakLeft = 4; // short ramp-in before wave 1
    this.lastPerformance = null;
    this.bus.emit('wave:break', { duration: this.breakLeft });
  }

  gameOver(): void {
    this.state = 'gameover';
  }

  skipBreak(): void {
    if (this.state === 'break') this.breakLeft = 0.01;
  }

  /** Dev: jump straight to a given wave number on the next break tick. */
  jumpToWave(wave: number): void {
    this.wave = Math.max(0, wave - 1);
    this.state = 'break';
    this.breakLeft = 0.01;
  }

  update(
    dt: number,
    simTime: number,
    player: { x: number; z: number; yaw: number; alive: boolean; damageTakenThisWave: number },
    playerLevel: number,
    weaponPower = 0,
  ): void {
    switch (this.state) {
      case 'idle':
      case 'gameover':
        return;

      case 'break':
        this.breakLeft -= dt;
        if (this.breakLeft <= 0) this.beginWave(simTime, player, playerLevel, weaponPower);
        return;

      case 'spawning': {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.queue.length > 0) {
          const batch = Math.min(this.balance.spawnBatchSize, this.queue.length);
          for (let i = 0; i < batch; i++) this.spawnOne(this.queue.pop()!, player);
          this.spawnTimer = this.balance.spawnBatchInterval;
        }
        if (this.queue.length === 0) this.state = 'active';
        return;
      }

      case 'active': {
        if (this.mgr.aliveFromWave(this.wave) === 0) {
          const clearTime = simTime - this.waveStartTime;
          this.lastPerformance = {
            clearTimeSec: clearTime,
            damageTaken: player.damageTakenThisWave - this.damageAtWaveStart,
          };
          this.bus.emit('wave:cleared', { wave: this.wave, clearTimeSec: clearTime });
          this.state = 'break';
          this.breakLeft = this.balance.breakDuration;
          this.fogDensityMult = 1;
          this.bus.emit('wave:break', { duration: this.breakLeft });
        }
        return;
      }
    }
  }

  private beginWave(
    simTime: number,
    player: { x: number; z: number; yaw: number; damageTakenThisWave: number },
    playerLevel: number,
    weaponPower: number,
  ): void {
    this.wave++;
    const generated = generateWave({
      wave: this.wave,
      rng: this.rng.fork(`wave-${this.wave}`),
      enemies: this.enemies,
      events: this.events,
      balance: this.balance,
      playerLevel,
      performance: this.lastPerformance,
      timeSurvivedSec: simTime,
      weaponPower,
      forcedEventId: this.forcedEventId ?? undefined,
    });
    this.forcedEventId = null;
    this.current = generated;
    this.fogDensityMult = generated.fogDensityMult;
    this.ammoDropMult = generated.ammoDropMult;
    if (generated.isBoss) this.bossNumber++;

    // Flatten entries into a shuffled spawn queue.
    this.queue.length = 0;
    for (const entry of generated.entries) {
      for (let c = 0; c < entry.count; c++) {
        this.queue.push({ enemyId: entry.enemyId, elite: entry.elite });
      }
    }
    this.rng.shuffle(this.queue);

    this.waveStartTime = simTime;
    this.damageAtWaveStart = player.damageTakenThisWave;
    this.state = 'spawning';
    this.spawnTimer = 0.5;
    this.bus.emit('wave:start', {
      wave: this.wave,
      eventId: generated.eventId,
      name: generated.eventName,
      description: generated.eventDescription,
    });
  }

  private spawnOne(q: QueuedSpawn, player: { x: number; z: number; yaw: number }): void {
    const cfg = this.enemies.find((e) => e.id === q.enemyId);
    if (!cfg) return;
    const point = this.pickSpawnPoint(player);
    const scaled = cfg.role === 'boss'
      ? scaleBoss(cfg, this.bossNumber, this.scaling)
      : scaleEnemy(cfg, this.wave, this.scaling, q.elite);
    // Small jitter so batch-mates don't stack.
    const jx = this.rng.range(-1.5, 1.5);
    const jz = this.rng.range(-1.5, 1.5);
    this.mgr.spawn(cfg, scaled, point.x + jx, point.z + jz, q.elite, this.wave);
  }

  /**
   * Spawn-point policy: within [min,max] distance of the player and outside
   * the player's forward view cone. Falls back to distance-only, then to any
   * point, so spawning can never stall.
   */
  private pickSpawnPoint(player: { x: number; z: number; yaw: number }): { x: number; z: number } {
    const pts = this.map.spawnPoints;
    const min2 = this.balance.minSpawnDistance ** 2;
    const max2 = this.balance.maxSpawnDistance ** 2;
    const cosHalfFov = Math.cos((this.balance.playerFovAvoidDeg * Math.PI) / 360);
    const fwdX = -Math.sin(player.yaw);
    const fwdZ = -Math.cos(player.yaw);

    let fallback: { x: number; z: number } | null = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const p = pts[this.rng.int(0, pts.length - 1)];
      const d2 = dist2XZ(p.x, p.z, player.x, player.z);
      if (d2 < min2 || d2 > max2) continue;
      fallback = p;
      const d = Math.sqrt(d2) || 1;
      const dot = ((p.x - player.x) / d) * fwdX + ((p.z - player.z) / d) * fwdZ;
      if (dot > cosHalfFov) continue; // inside view cone — rejected
      return p;
    }
    if (fallback) return fallback;
    // Last resort: farthest point from the player.
    let best = pts[0];
    let bestD2 = -1;
    for (const p of pts) {
      const d2 = dist2XZ(p.x, p.z, player.x, player.z);
      if (d2 > bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    return best;
  }
}
