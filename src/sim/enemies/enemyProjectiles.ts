/**
 * Pooled enemy projectiles (spitter globs, boss barrage) in SoA layout.
 */

import type { CollisionWorld } from '../collision';
import type { GameBus } from '../events';

const MAX = 256;

export class EnemyProjectiles {
  readonly posX = new Float32Array(MAX);
  readonly posY = new Float32Array(MAX);
  readonly posZ = new Float32Array(MAX);
  readonly velX = new Float32Array(MAX);
  readonly velY = new Float32Array(MAX);
  readonly velZ = new Float32Array(MAX);
  readonly radius = new Float32Array(MAX);
  readonly damage = new Float32Array(MAX);
  readonly life = new Float32Array(MAX);
  readonly color = new Uint32Array(MAX);
  readonly alive = new Uint8Array(MAX);
  activeCount = 0;
  private cursor = 0;

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    radius: number, damage: number, color: number,
  ): void {
    // Ring scan for a free slot; oldest gets overwritten under pressure.
    for (let n = 0; n < MAX; n++) {
      const i = (this.cursor + n) % MAX;
      if (!this.alive[i]) {
        this.cursor = (i + 1) % MAX;
        this.alive[i] = 1;
        this.activeCount++;
        this.posX[i] = x; this.posY[i] = y; this.posZ[i] = z;
        this.velX[i] = vx; this.velY[i] = vy; this.velZ[i] = vz;
        this.radius[i] = radius;
        this.damage[i] = damage;
        this.color[i] = color;
        this.life[i] = 6;
        return;
      }
    }
  }

  update(
    dt: number,
    collision: CollisionWorld,
    player: { x: number; y: number; z: number; alive: boolean },
    damagePlayer: (amount: number, fromX: number, fromZ: number) => void,
    bus: GameBus,
  ): void {
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive[i] = 0;
        this.activeCount--;
        continue;
      }
      const px = this.posX[i];
      const py = this.posY[i];
      const pz = this.posZ[i];
      const nx = px + this.velX[i] * dt;
      const ny = py + this.velY[i] * dt;
      const nz = pz + this.velZ[i] * dt;

      // Player hit (sphere vs capsule approximated as sphere at torso)
      if (player.alive) {
        const dx = nx - player.x;
        const dy = ny - (player.y + 1.0);
        const dz = nz - player.z;
        const hitR = this.radius[i] + 0.65;
        if (dx * dx + dy * dy + dz * dz < hitR * hitR) {
          damagePlayer(this.damage[i], px, pz);
          this.alive[i] = 0;
          this.activeCount--;
          bus.emit('impact', { x: nx, y: ny, z: nz, nx: 0, ny: 1, nz: 0, surface: 'world' });
          continue;
        }
      }

      // World hit
      const segLen = Math.sqrt(
        (nx - px) * (nx - px) + (ny - py) * (ny - py) + (nz - pz) * (nz - pz),
      );
      if (segLen > 1e-6) {
        const hit = collision.raycast(px, py, pz, (nx - px) / segLen, (ny - py) / segLen, (nz - pz) / segLen, segLen);
        if (hit) {
          bus.emit('impact', { x: px, y: py, z: pz, nx: hit.nx, ny: hit.ny, nz: hit.nz, surface: 'world' });
          this.alive[i] = 0;
          this.activeCount--;
          continue;
        }
      }
      this.posX[i] = nx;
      this.posY[i] = ny;
      this.posZ[i] = nz;
    }
  }

  clear(): void {
    this.alive.fill(0);
    this.activeCount = 0;
  }
}
