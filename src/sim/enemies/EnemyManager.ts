/**
 * The horde's data store. ECS-style structure-of-arrays for up to MAX_ENEMIES
 * concurrent enemies: contiguous typed arrays, a free-list, and a spatial
 * hash for proximity queries. Zero allocation per frame.
 *
 * Behavior lives in enemyAI.ts (updateEnemies) and enemyQueries.ts
 * (raycasts) — this file owns lifecycle: spawn, damage, death, recycling.
 */

import type { EnemyConfig } from '../../config/types';
import type { ScaledEnemyStats } from './scaling';
import type { GameBus } from '../events';
import type { Rng } from '../../core/Rng';
import type { StatusId } from '../../config/types';
import { SpatialHashGrid } from '../../core/SpatialHashGrid';
import { StatusStore } from '../status';
import { STATUS_EFFECTS, STATUS_INTERACTIONS } from '../../config/statusEffects';
import { dist2XZ, wrapAngle } from '../../core/math';

export const MAX_ENEMIES = 1024;

/** FSM state codes (numeric for the SoA layout). */
export const enum EState {
  Spawning = 0,
  Chase = 1,
  Windup = 2,
  Recover = 3,
  Fuse = 4,
  Dying = 5,
  Charging = 6,
}

export const E_STATE_NAMES = ['spawning', 'chase', 'windup', 'recover', 'fuse', 'dying', 'charging'];

export interface DamageOpts {
  fromX: number;
  fromZ: number;
  isHead: boolean;
  isCrit: boolean;
  byPlayer: boolean;
  weaponId: string | null;
}

export interface DamageResult {
  applied: number;
  killed: boolean;
  shielded: boolean;
}

export class EnemyManager {
  readonly types: EnemyConfig[];
  private readonly typeIndexById = new Map<string, number>();

  readonly aliveFlags = new Uint8Array(MAX_ENEMIES);
  readonly typeIdx = new Uint8Array(MAX_ENEMIES);
  readonly posX = new Float32Array(MAX_ENEMIES);
  readonly posY = new Float32Array(MAX_ENEMIES);
  readonly posZ = new Float32Array(MAX_ENEMIES);
  readonly velX = new Float32Array(MAX_ENEMIES);
  readonly velZ = new Float32Array(MAX_ENEMIES);
  readonly yaw = new Float32Array(MAX_ENEMIES);
  readonly hp = new Float32Array(MAX_ENEMIES);
  readonly maxHp = new Float32Array(MAX_ENEMIES);
  readonly shieldHp = new Float32Array(MAX_ENEMIES);
  readonly speed = new Float32Array(MAX_ENEMIES);
  readonly damage = new Float32Array(MAX_ENEMIES);
  readonly scale = new Float32Array(MAX_ENEMIES);
  readonly attackCd = new Float32Array(MAX_ENEMIES);
  readonly windup = new Float32Array(MAX_ENEMIES);
  readonly fuse = new Float32Array(MAX_ENEMIES);
  readonly state = new Uint8Array(MAX_ENEMIES);
  readonly elite = new Uint8Array(MAX_ENEMIES);
  readonly xpVal = new Float32Array(MAX_ENEMIES);
  readonly scoreVal = new Float32Array(MAX_ENEMIES);
  readonly buffMult = new Float32Array(MAX_ENEMIES);
  readonly hitFlash = new Float32Array(MAX_ENEMIES);
  readonly animPhase = new Float32Array(MAX_ENEMIES);
  readonly deathTimer = new Float32Array(MAX_ENEMIES);
  readonly aiTimer = new Float32Array(MAX_ENEMIES);
  readonly desiredVX = new Float32Array(MAX_ENEMIES);
  readonly desiredVZ = new Float32Array(MAX_ENEMIES);
  /** Boss charge timer; -1 marks a pending slam strike. */
  readonly special = new Float32Array(MAX_ENEMIES);
  readonly bossPhase = new Uint8Array(MAX_ENEMIES);
  /** Phase speed multiplier — 1 for everything except bosses in later phases. */
  readonly bossSpeedMult = new Float32Array(MAX_ENEMIES).fill(1);
  readonly waveTag = new Int16Array(MAX_ENEMIES);
  readonly losClear = new Uint8Array(MAX_ENEMIES);
  /** Raycast dedupe stamps (see enemyQueries). */
  readonly raycastStamp = new Int32Array(MAX_ENEMIES).fill(-1);
  stampCounter = 0;

  readonly grid = new SpatialHashGrid(4);
  readonly status = new StatusStore(MAX_ENEMIES, STATUS_EFFECTS, STATUS_INTERACTIONS);
  readonly bus: GameBus;

  aliveCount = 0;
  bossIdx = -1;
  /** AI think operations this frame (perf overlay). */
  aiThinksThisFrame = 0;
  highWater = 0;

  private readonly freeList: number[] = [];
  spawnMinionFn: ((enemyId: string, x: number, z: number, wave: number) => void) | null = null;

  constructor(types: EnemyConfig[], bus: GameBus) {
    this.types = types;
    this.bus = bus;
    types.forEach((t, i) => this.typeIndexById.set(t.id, i));
    this.waveTag.fill(-1);
  }

  /** Wired by Simulation so boss summons use the normal spawn path. */
  setMinionSpawner(fn: (enemyId: string, x: number, z: number, wave: number) => void): void {
    this.spawnMinionFn = fn;
  }

  configOf(idx: number): EnemyConfig {
    return this.types[this.typeIdx[idx]];
  }

  spawn(cfg: EnemyConfig, scaled: ScaledEnemyStats, x: number, z: number, elite: boolean, wave: number): number {
    let idx: number;
    if (this.freeList.length > 0) {
      idx = this.freeList.pop()!;
    } else if (this.highWater < MAX_ENEMIES) {
      idx = this.highWater++;
    } else {
      return -1; // horde is full
    }
    const typeIndex = this.typeIndexById.get(cfg.id);
    if (typeIndex === undefined) return -1;

    this.aliveFlags[idx] = 1;
    this.typeIdx[idx] = typeIndex;
    this.posX[idx] = x;
    this.posY[idx] = 0;
    this.posZ[idx] = z;
    this.velX[idx] = 0;
    this.velZ[idx] = 0;
    this.yaw[idx] = 0;
    this.hp[idx] = scaled.hp;
    this.maxHp[idx] = scaled.hp;
    this.shieldHp[idx] = cfg.shield ? cfg.shield.hp : 0;
    this.speed[idx] = scaled.speed;
    this.damage[idx] = scaled.damage;
    this.scale[idx] = scaled.scale;
    this.attackCd[idx] = cfg.attackCooldown * 0.5;
    this.windup[idx] = 0;
    this.fuse[idx] = 0;
    this.state[idx] = EState.Spawning;
    this.elite[idx] = elite ? 1 : 0;
    this.xpVal[idx] = scaled.xp;
    this.scoreVal[idx] = scaled.score;
    this.buffMult[idx] = 1;
    this.hitFlash[idx] = 0;
    this.animPhase[idx] = 0;
    this.deathTimer[idx] = 0;
    this.aiTimer[idx] = 0;
    this.desiredVX[idx] = 0;
    this.desiredVZ[idx] = 0;
    this.special[idx] = 0;
    this.bossPhase[idx] = 0;
    this.bossSpeedMult[idx] = 1;
    this.waveTag[idx] = wave;
    this.losClear[idx] = 0;
    this.status.clear(idx);
    this.grid.insert(idx, x, z);
    this.aliveCount++;

    if (cfg.role === 'boss') {
      this.bossIdx = idx;
      this.bus.emit('boss:spawned', { idx, name: cfg.name, maxHp: scaled.hp });
    }
    this.bus.emit('enemy:spawned', { idx, enemyId: cfg.id, elite });
    return idx;
  }

  /**
   * Apply damage with frontal-shield logic. Returns damage landed on hp
   * (for lifesteal), kill flag, and whether the shield ate it.
   */
  applyDamage(idx: number, amount: number, opts: DamageOpts): DamageResult {
    // Fuse-state exploders are already committed to detonation — further hits
    // must not re-kill them (double enemy:died → double XP/score).
    if (!this.aliveFlags[idx] || this.state[idx] === EState.Dying || this.state[idx] === EState.Fuse) {
      return { applied: 0, killed: false, shielded: false };
    }
    const cfg = this.configOf(idx);

    if (this.shieldHp[idx] > 0 && cfg.shield) {
      const toSrc = Math.atan2(-(opts.fromX - this.posX[idx]), -(opts.fromZ - this.posZ[idx]));
      const diff = Math.abs(wrapAngle(toSrc - this.yaw[idx]));
      if (diff < (cfg.shield.arcDeg * Math.PI) / 360) {
        this.shieldHp[idx] -= amount;
        this.hitFlash[idx] = 1;
        if (this.shieldHp[idx] <= 0) {
          this.shieldHp[idx] = 0;
          this.bus.emit('enemy:shield-break', {
            idx,
            x: this.posX[idx],
            y: this.posY[idx] + cfg.height * this.scale[idx] * 0.5,
            z: this.posZ[idx],
          });
        }
        return { applied: 0, killed: false, shielded: true };
      }
    }

    this.hp[idx] -= amount;
    this.hitFlash[idx] = 1;
    const cy = this.posY[idx] + cfg.height * this.scale[idx] * (opts.isHead ? 0.9 : 0.55);
    this.bus.emit('enemy:hit', {
      idx,
      x: this.posX[idx],
      y: cy,
      z: this.posZ[idx],
      damage: amount,
      isCrit: opts.isCrit,
      isHead: opts.isHead,
    });
    this.bus.emit('damage-number', {
      x: this.posX[idx],
      y: this.posY[idx] + cfg.height * this.scale[idx] + 0.4,
      z: this.posZ[idx],
      amount: Math.round(amount),
      isCrit: opts.isCrit || opts.isHead,
    });

    if (this.hp[idx] <= 0) {
      this.kill(idx, opts.byPlayer, null);
      return { applied: amount, killed: true, shielded: false };
    }
    return { applied: amount, killed: false, shielded: false };
  }

  applyStatus(idx: number, statusId: StatusId): void {
    if (!this.aliveFlags[idx] || this.state[idx] === EState.Dying) return;
    const reaction = this.status.apply(idx, statusId);
    if (reaction) {
      const cfg = this.configOf(idx);
      this.bus.emit('status:reaction', {
        result: reaction.result,
        x: this.posX[idx],
        y: this.posY[idx] + cfg.height * this.scale[idx] * 0.5,
        z: this.posZ[idx],
        bonusDamage: reaction.bonusDamage,
      });
      this.applyDamage(idx, reaction.bonusDamage, {
        fromX: this.posX[idx],
        fromZ: this.posZ[idx] + 1,
        isHead: false,
        isCrit: true,
        byPlayer: true,
        weaponId: null,
      });
    }
  }

  /** Force-kill. Exploders defer to a short fuse so they still detonate. */
  kill(idx: number, byPlayer: boolean, rng: Rng | null): void {
    if (!this.aliveFlags[idx] || this.state[idx] === EState.Dying) return;
    const cfg = this.configOf(idx);

    if (cfg.explode && this.state[idx] !== EState.Fuse) {
      this.state[idx] = EState.Fuse;
      this.fuse[idx] = 0.12;
      this.hp[idx] = 0;
      return; // detonation in enemyAI.update finishes the job
    }

    this.state[idx] = EState.Dying;
    this.deathTimer[idx] = 0.9;
    this.hp[idx] = 0;
    this.grid.remove(idx);

    const currency =
      Math.round(cfg.currencyMin + (rng ? rng.next() : 0.5) * (cfg.currencyMax - cfg.currencyMin)) *
      (this.elite[idx] ? 2 : 1);

    const isBoss = cfg.role === 'boss';
    if (isBoss) {
      this.bossIdx = -1;
      this.bus.emit('boss:died', {
        x: this.posX[idx],
        y: this.posY[idx] + cfg.height * this.scale[idx] * 0.5,
        z: this.posZ[idx],
      });
    }
    this.bus.emit('enemy:died', {
      idx,
      enemyId: cfg.id,
      x: this.posX[idx],
      y: this.posY[idx] + cfg.height * this.scale[idx] * 0.4,
      z: this.posZ[idx],
      xp: this.xpVal[idx],
      score: this.scoreVal[idx],
      currency,
      isBoss,
      killedByPlayer: byPlayer,
    });
  }

  /** Return a slot to the free list (after the death animation). */
  freeSlot(idx: number): void {
    if (!this.aliveFlags[idx]) return;
    this.aliveFlags[idx] = 0;
    this.aliveCount--;
    this.grid.remove(idx);
    this.freeList.push(idx);
    this.status.clear(idx);
  }

  killAll(byPlayer: boolean, rng: Rng): void {
    for (let i = 0; i < this.highWater; i++) {
      if (this.aliveFlags[i] && this.state[i] !== EState.Dying) this.kill(i, byPlayer, rng);
    }
  }

  /**
   * Live combatants from a wave (wave-clear detection). Dying enemies are
   * corpses playing an animation — excluding them keeps the clear banner
   * from lagging ~0.9s behind the killing blow. Fuse-state exploders still
   * count: their detonation belongs to the wave.
   */
  aliveFromWave(wave: number): number {
    let n = 0;
    for (let i = 0; i < this.highWater; i++) {
      if (this.aliveFlags[i] && this.state[i] !== EState.Dying && this.waveTag[i] === wave) n++;
    }
    return n;
  }

  averageDistanceTo(x: number, z: number): number {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < this.highWater; i++) {
      if (!this.aliveFlags[i] || this.state[i] === EState.Dying) continue;
      sum += Math.sqrt(dist2XZ(this.posX[i], this.posZ[i], x, z));
      n++;
    }
    return n === 0 ? Infinity : sum / n;
  }

  /** Live enemy indices within a radius (explosions, chains, magnets). */
  queryRadius(x: number, z: number, radius: number, out: number[]): number {
    this.grid.queryCircle(x, z, radius, out);
    let w = 0;
    for (let r = 0; r < out.length; r++) {
      const i = out[r];
      if (this.aliveFlags[i] && this.state[i] !== EState.Dying) out[w++] = i;
    }
    out.length = w;
    return w;
  }

  clearAllImmediate(): void {
    for (let i = 0; i < this.highWater; i++) {
      if (this.aliveFlags[i]) this.freeSlot(i);
    }
    this.bossIdx = -1;
  }
}
