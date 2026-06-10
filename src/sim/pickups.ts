/**
 * Pooled world pickups (health/armor/ammo/credits) with magnet attraction.
 * Drop rolls are weighted from PICKUPS config; the ammo-scarce wave event
 * scales ammo drop odds down.
 */

import type { PickupConfig } from '../config/types';
import type { GameBus } from './events';
import type { Rng } from '../core/Rng';
import { dist2XZ } from '../core/math';

const MAX = 192;

export interface PickupHandlers {
  heal: (amount: number) => void;
  addArmor: (amount: number) => void;
  addAmmoFraction: (frac: number) => void;
  addCredits: (amount: number) => void;
}

export class Pickups {
  readonly posX = new Float32Array(MAX);
  readonly posY = new Float32Array(MAX);
  readonly posZ = new Float32Array(MAX);
  readonly velY = new Float32Array(MAX);
  readonly life = new Float32Array(MAX);
  readonly alive = new Uint8Array(MAX);
  readonly kindIdx = new Uint8Array(MAX);
  activeCount = 0;

  private cursor = 0;
  private readonly configs: PickupConfig[];
  private readonly bus: GameBus;

  constructor(configs: PickupConfig[], bus: GameBus) {
    this.configs = configs;
    this.bus = bus;
  }

  configOf(i: number): PickupConfig {
    return this.configs[this.kindIdx[i]];
  }

  /** Weighted drop roll at a death location. Returns true if spawned. */
  rollDrop(x: number, z: number, rng: Rng, dropChance: number, ammoDropMult: number): boolean {
    if (!rng.chance(dropChance)) return false;
    let total = 0;
    for (const c of this.configs) {
      total += c.kind === 'ammo' ? c.weight * ammoDropMult : c.weight;
    }
    let roll = rng.next() * total;
    let picked = this.configs[0];
    for (const c of this.configs) {
      roll -= c.kind === 'ammo' ? c.weight * ammoDropMult : c.weight;
      if (roll <= 0) {
        picked = c;
        break;
      }
    }
    return this.spawn(picked, x, z);
  }

  spawn(cfg: PickupConfig, x: number, z: number): boolean {
    const kindIdx = this.configs.indexOf(cfg);
    if (kindIdx === -1) return false;
    for (let n = 0; n < MAX; n++) {
      const i = (this.cursor + n) % MAX;
      if (!this.alive[i]) {
        this.cursor = (i + 1) % MAX;
        this.alive[i] = 1;
        this.activeCount++;
        this.posX[i] = x;
        this.posY[i] = 0.9;
        this.posZ[i] = z;
        this.velY[i] = 2.2; // spawn pop
        this.life[i] = cfg.lifetime;
        this.kindIdx[i] = kindIdx;
        this.bus.emit('pickup:spawned', { idx: i });
        return true;
      }
    }
    return false;
  }

  update(
    dt: number,
    player: { x: number; y: number; z: number; alive: boolean },
    pickupRadiusMult: number,
    handlers: PickupHandlers,
  ): void {
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive[i] = 0;
        this.activeCount--;
        continue;
      }
      // Bob & settle
      this.velY[i] -= 6 * dt;
      this.posY[i] += this.velY[i] * dt;
      if (this.posY[i] < 0.5) {
        this.posY[i] = 0.5;
        this.velY[i] = 0;
      }

      if (!player.alive) continue;
      const cfg = this.configs[this.kindIdx[i]];
      const magnetR = cfg.magnetRadius * pickupRadiusMult;
      const d2 = dist2XZ(this.posX[i], this.posZ[i], player.x, player.z);

      if (d2 < 1.2 * 1.2) {
        this.collect(i, cfg, handlers);
        continue;
      }
      if (d2 < magnetR * magnetR) {
        const d = Math.sqrt(d2) || 1;
        const pull = 14 * dt * (1 - d / magnetR + 0.4);
        this.posX[i] += ((player.x - this.posX[i]) / d) * pull;
        this.posZ[i] += ((player.z - this.posZ[i]) / d) * pull;
      }
    }
  }

  private collect(i: number, cfg: PickupConfig, handlers: PickupHandlers): void {
    this.alive[i] = 0;
    this.activeCount--;
    switch (cfg.kind) {
      case 'health':
        handlers.heal(cfg.amount);
        break;
      case 'armor':
        handlers.addArmor(cfg.amount);
        break;
      case 'ammo':
        handlers.addAmmoFraction(cfg.amount);
        break;
      case 'credits':
        handlers.addCredits(cfg.amount);
        break;
    }
    this.bus.emit('pickup:collected', { kind: cfg.kind, amount: cfg.amount });
  }

  clear(): void {
    this.alive.fill(0);
    this.activeCount = 0;
  }
}
