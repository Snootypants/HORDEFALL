/**
 * Destructible explosive barrels. Small fixed roster per map; chain-react
 * with each other and with exploder enemies.
 */

import type { BarrelDef } from './mapGen';
import type { EnemyManager } from './enemies/EnemyManager';
import type { GameBus } from './events';
import { clamp, dist2XZ, raySphere } from '../core/math';

const BARREL_HP = 30;
const RADIUS = 4.2;
const DAMAGE = 70;
/** Physical body radius — blocks enemies and matches the rendered cylinder. */
export const BARREL_RADIUS = 0.5;

export class Barrels {
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly hp: Float32Array;
  readonly alive: Uint8Array;
  readonly count: number;
  private readonly queryScratch: number[] = [];

  constructor(defs: BarrelDef[]) {
    this.count = defs.length;
    this.x = new Float32Array(this.count);
    this.z = new Float32Array(this.count);
    this.hp = new Float32Array(this.count);
    this.alive = new Uint8Array(this.count);
    defs.forEach((d, i) => {
      this.x[i] = d.x;
      this.z[i] = d.z;
      this.hp[i] = BARREL_HP;
      this.alive[i] = 1;
    });
  }

  /** Nearest barrel hit by a ray, or -1. Writes distance to outT[0]. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, outT: number[]): number {
    let best = -1;
    let bestT = maxDist;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, this.x[i], 0.55, this.z[i], 0.7);
      if (t !== null && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    outT[0] = bestT;
    return best;
  }

  damage(
    i: number,
    amount: number,
    enemies: EnemyManager,
    bus: GameBus,
    playerPos: { x: number; z: number },
    damagePlayer: (amount: number, fromX: number, fromZ: number) => void,
  ): void {
    if (!this.alive[i]) return;
    this.hp[i] -= amount;
    if (this.hp[i] > 0) return;
    this.alive[i] = 0;
    bus.emit('barrel:exploded', { x: this.x[i], y: 0.6, z: this.z[i], radius: RADIUS });
    bus.emit('explosion', { x: this.x[i], y: 0.6, z: this.z[i], radius: RADIUS });

    // Enemies
    const hits = this.queryScratch;
    enemies.queryRadius(this.x[i], this.z[i], RADIUS, hits);
    for (let n = 0; n < hits.length; n++) {
      const j = hits[n];
      const d = Math.sqrt(dist2XZ(this.x[i], this.z[i], enemies.posX[j], enemies.posZ[j]));
      const falloff = clamp(1 - d / RADIUS, 0.3, 1);
      enemies.applyDamage(j, DAMAGE * falloff, {
        fromX: this.x[i], fromZ: this.z[i], isHead: false, isCrit: false, byPlayer: true, weaponId: null,
      });
    }
    // Player splash
    const pd2 = dist2XZ(this.x[i], this.z[i], playerPos.x, playerPos.z);
    if (pd2 < RADIUS * RADIUS) {
      const falloff = clamp(1 - Math.sqrt(pd2) / RADIUS, 0.25, 1);
      damagePlayer(DAMAGE * 0.5 * falloff, this.x[i], this.z[i]);
    }
    // Chain to other barrels
    for (let other = 0; other < this.count; other++) {
      if (other === i || !this.alive[other]) continue;
      if (dist2XZ(this.x[i], this.z[i], this.x[other], this.z[other]) < RADIUS * RADIUS) {
        this.damage(other, BARREL_HP, enemies, bus, playerPos, damagePlayer);
      }
    }
  }
}
