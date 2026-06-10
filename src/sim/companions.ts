/**
 * Companion units from upgrades: hunter drones (orbit + zap) and sentry
 * turrets (placed at wave start). Tiny fixed-size rosters — plain structs.
 */

import type { CombatContext } from './combat/context';
import { applyOnHitEffects } from './combat/onHit';
import { dist2XZ } from '../core/math';

const DRONE_RANGE = 24;
const DRONE_DAMAGE = 9;
const DRONE_INTERVAL = 0.7;
const TURRET_RANGE = 22;
const TURRET_DAMAGE = 7;
const TURRET_INTERVAL = 0.35;

export interface DroneState {
  x: number;
  y: number;
  z: number;
  fireLeft: number;
  orbitPhase: number;
}

export interface TurretState {
  x: number;
  z: number;
  yaw: number;
  fireLeft: number;
  active: boolean;
}

export class Companions {
  readonly drones: DroneState[] = [];
  readonly turrets: TurretState[] = [];
  private readonly targetScratch: number[] = [];

  syncCounts(droneCount: number, turretCount: number): void {
    while (this.drones.length < droneCount) {
      this.drones.push({ x: 0, y: 2.4, z: 0, fireLeft: 0, orbitPhase: (this.drones.length * Math.PI * 2) / 3 });
    }
    this.drones.length = Math.min(this.drones.length, droneCount);
    while (this.turrets.length < turretCount) {
      this.turrets.push({ x: 0, z: 0, yaw: 0, fireLeft: 0, active: false });
    }
    this.turrets.length = Math.min(this.turrets.length, turretCount);
  }

  /** Called at wave start: turrets re-deploy at the player's feet. */
  deployTurrets(px: number, pz: number, ctx: CombatContext): void {
    for (const t of this.turrets) {
      t.x = px + (ctx.rng.next() - 0.5) * 3;
      t.z = pz + (ctx.rng.next() - 0.5) * 3;
      t.active = true;
      ctx.bus.emit('turret:placed', { x: t.x, z: t.z });
    }
  }

  update(dt: number, px: number, py: number, pz: number, ctx: CombatContext): void {
    // Drones orbit the player and zap the nearest enemy.
    for (const d of this.drones) {
      d.orbitPhase += dt * 1.4;
      const tx = px + Math.cos(d.orbitPhase) * 2.0;
      const tz = pz + Math.sin(d.orbitPhase) * 2.0;
      d.x += (tx - d.x) * Math.min(1, dt * 6);
      d.z += (tz - d.z) * Math.min(1, dt * 6);
      d.y += (py + 2.4 - d.y) * Math.min(1, dt * 4);
      d.fireLeft -= dt;
      if (d.fireLeft <= 0) {
        if (this.fireAtNearest(d.x, d.y, d.z, DRONE_RANGE, DRONE_DAMAGE, ctx)) {
          d.fireLeft = DRONE_INTERVAL;
        } else {
          d.fireLeft = 0.2;
        }
      }
    }
    // Turrets hold position.
    for (const t of this.turrets) {
      if (!t.active) continue;
      t.fireLeft -= dt;
      if (t.fireLeft <= 0) {
        if (this.fireAtNearest(t.x, 1.0, t.z, TURRET_RANGE, TURRET_DAMAGE, ctx, t)) {
          t.fireLeft = TURRET_INTERVAL;
        } else {
          t.fireLeft = 0.25;
        }
      }
    }
  }

  private fireAtNearest(
    x: number, y: number, z: number,
    range: number, damage: number,
    ctx: CombatContext,
    turret?: TurretState,
  ): boolean {
    const enemies = ctx.enemies;
    enemies.queryRadius(x, z, range, this.targetScratch);
    let best = -1;
    let bestD2 = range * range;
    for (let n = 0; n < this.targetScratch.length; n++) {
      const j = this.targetScratch[n];
      const d2 = dist2XZ(x, z, enemies.posX[j], enemies.posZ[j]);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = j;
      }
    }
    if (best === -1) return false;
    const cfg = enemies.configOf(best);
    const ty = enemies.posY[best] + cfg.height * enemies.scale[best] * 0.55;
    if (ctx.collision.losBlocked(x, y, z, enemies.posX[best], ty, enemies.posZ[best])) return false;
    if (turret) turret.yaw = Math.atan2(-(enemies.posX[best] - x), -(enemies.posZ[best] - z));
    const result = enemies.applyDamage(best, damage, {
      fromX: x, fromZ: z, isHead: false, isCrit: false, byPlayer: true, weaponId: null,
    });
    ctx.stats.damageDealt += result.applied;
    if (result.killed) ctx.stats.recordKill(null);
    if (result.applied > 0) {
      applyOnHitEffects(ctx, best, enemies.posX[best], ty, enemies.posZ[best], result.applied);
    }
    ctx.bus.emit('companion:fired', {
      x0: x, y0: y, z0: z,
      x1: enemies.posX[best], y1: ty, z1: enemies.posZ[best],
    });
    return true;
  }
}
