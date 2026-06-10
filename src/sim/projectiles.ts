/**
 * Player projectiles (grenades, arc bolts) — pooled SoA. Handles gravity
 * arcs, world/enemy contact, explosive payloads, and chain lightning.
 */

import type { WeaponConfig } from '../config/types';
import type { CombatContext } from './combat/context';
import { applyOnHitEffects, explodeAt } from './combat/onHit';
import { dist2XZ, raySphere } from '../core/math';

const MAX = 512;

export class PlayerProjectiles {
  readonly posX = new Float32Array(MAX);
  readonly posY = new Float32Array(MAX);
  readonly posZ = new Float32Array(MAX);
  readonly velX = new Float32Array(MAX);
  readonly velY = new Float32Array(MAX);
  readonly velZ = new Float32Array(MAX);
  readonly life = new Float32Array(MAX);
  readonly damage = new Float32Array(MAX);
  readonly alive = new Uint8Array(MAX);
  /** Index into the weapons list for projectile spec lookup. */
  readonly weaponRef: (WeaponConfig | null)[] = new Array(MAX).fill(null);
  activeCount = 0;
  private cursor = 0;
  private readonly hitScratch: number[] = [];

  spawn(weapon: WeaponConfig, x: number, y: number, z: number, dx: number, dy: number, dz: number, damage: number): void {
    const spec = weapon.projectile;
    if (!spec) return;
    for (let n = 0; n < MAX; n++) {
      const i = (this.cursor + n) % MAX;
      if (!this.alive[i]) {
        this.cursor = (i + 1) % MAX;
        this.alive[i] = 1;
        this.activeCount++;
        this.posX[i] = x;
        this.posY[i] = y;
        this.posZ[i] = z;
        this.velX[i] = dx * spec.speed;
        this.velY[i] = dy * spec.speed;
        this.velZ[i] = dz * spec.speed;
        this.life[i] = spec.lifetime;
        this.damage[i] = damage;
        this.weaponRef[i] = weapon;
        return;
      }
    }
  }

  update(dt: number, ctx: CombatContext): void {
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      const weapon = this.weaponRef[i]!;
      const spec = weapon.projectile!;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Grenades that time out still detonate.
        if (spec.explosive) {
          this.detonate(i, ctx);
        }
        this.kill(i);
        continue;
      }

      this.velY[i] -= spec.gravity * dt;
      const px = this.posX[i];
      const py = this.posY[i];
      const pz = this.posZ[i];
      let nx = px + this.velX[i] * dt;
      let ny = py + this.velY[i] * dt;
      let nz = pz + this.velZ[i] * dt;

      // World contact
      const segX = nx - px;
      const segY = ny - py;
      const segZ = nz - pz;
      const segLen = Math.sqrt(segX * segX + segY * segY + segZ * segZ);
      if (segLen > 1e-6) {
        const hit = ctx.collision.raycast(px, py, pz, segX / segLen, segY / segLen, segZ / segLen, segLen);
        if (hit) {
          nx = px + (segX / segLen) * hit.t;
          ny = py + (segY / segLen) * hit.t;
          nz = pz + (segZ / segLen) * hit.t;
          ctx.bus.emit('impact', { x: nx, y: ny, z: nz, nx: hit.nx, ny: hit.ny, nz: hit.nz, surface: 'world' });
          if (spec.explosive) this.detonateAt(nx, ny, nz, i, ctx);
          this.kill(i);
          continue;
        }
      }

      // Enemy contact: nearest body sphere along the segment
      const enemies = ctx.enemies;
      enemies.queryRadius(nx, nz, 3 + spec.radius, this.hitScratch);
      let hitIdx = -1;
      let hitT = Infinity;
      for (let n = 0; n < this.hitScratch.length; n++) {
        const j = this.hitScratch[n];
        const cfg = enemies.configOf(j);
        const h = cfg.height * enemies.scale[j];
        const r = Math.max(cfg.radius * enemies.scale[j], h * 0.45) + spec.radius;
        const t = segLen > 1e-6
          ? raySphere(px, py, pz, segX / segLen, segY / segLen, segZ / segLen, enemies.posX[j], enemies.posY[j] + h * 0.5, enemies.posZ[j], r)
          : null;
        if (t !== null && t <= segLen && t < hitT) {
          hitT = t;
          hitIdx = j;
        }
      }
      if (hitIdx !== -1) {
        const hx = px + (segX / segLen) * hitT;
        const hy = py + (segY / segLen) * hitT;
        const hz = pz + (segZ / segLen) * hitT;
        const result = enemies.applyDamage(hitIdx, this.damage[i], {
          fromX: px, fromZ: pz, isHead: false, isCrit: false, byPlayer: true, weaponId: weapon.id,
        });
        ctx.stats.damageDealt += result.applied;
        ctx.stats.shotsHit++;
        if (result.killed) ctx.stats.recordKill(weapon.id);
        if (result.applied > 0) applyOnHitEffects(ctx, hitIdx, hx, hy, hz, result.applied);
        ctx.bus.emit('impact', { x: hx, y: hy, z: hz, nx: 0, ny: 1, nz: 0, surface: 'enemy' });

        if (spec.explosive) this.detonateAt(hx, hy, hz, i, ctx);
        if (spec.chain) this.chainFrom(hitIdx, hx, hy, hz, i, ctx);
        this.kill(i);
        continue;
      }

      this.posX[i] = nx;
      this.posY[i] = ny;
      this.posZ[i] = nz;
    }
  }

  private detonate(i: number, ctx: CombatContext): void {
    this.detonateAt(this.posX[i], this.posY[i], this.posZ[i], i, ctx);
  }

  private detonateAt(x: number, y: number, z: number, i: number, ctx: CombatContext): void {
    const spec = this.weaponRef[i]!.projectile!;
    if (!spec.explosive) return;
    const dmg = spec.explosive.damage * ctx.player().stats.damageMult;
    explodeAt(ctx, x, y, z, spec.explosive.radius, dmg, this.weaponRef[i]!.id);
  }

  /** Arccaster: jump to up to `count` nearby enemies at reduced damage. */
  private chainFrom(fromIdx: number, x: number, y: number, z: number, i: number, ctx: CombatContext): void {
    const spec = this.weaponRef[i]!.projectile!;
    const chain = spec.chain!;
    const enemies = ctx.enemies;
    let srcIdx = fromIdx;
    let sx = x;
    let sy = y;
    let sz = z;
    let dmg = this.damage[i] * chain.damageMult;
    // Own array — aliasing hitScratch here would corrupt callers' queries.
    const visitedIdx: number[] = [fromIdx];

    for (let hop = 0; hop < chain.count; hop++) {
      let best = -1;
      let bestD2 = chain.range * chain.range;
      enemies.queryRadius(sx, sz, chain.range, chainQueryScratch);
      for (let n = 0; n < chainQueryScratch.length; n++) {
        const j = chainQueryScratch[n];
        if (visitedIdx.indexOf(j) !== -1) continue;
        const d2 = dist2XZ(sx, sz, enemies.posX[j], enemies.posZ[j]);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = j;
        }
      }
      if (best === -1) break;
      const cfg = enemies.configOf(best);
      const ty = enemies.posY[best] + cfg.height * enemies.scale[best] * 0.5;
      ctx.bus.emit('arc:chain', { x0: sx, y0: sy, z0: sz, x1: enemies.posX[best], y1: ty, z1: enemies.posZ[best] });
      const result = enemies.applyDamage(best, dmg, {
        fromX: sx, fromZ: sz, isHead: false, isCrit: false, byPlayer: true, weaponId: this.weaponRef[i]!.id,
      });
      ctx.stats.damageDealt += result.applied;
      if (result.killed) ctx.stats.recordKill(this.weaponRef[i]!.id);
      enemies.applyStatus(best, 'shock');
      visitedIdx.push(best);
      srcIdx = best;
      sx = enemies.posX[best];
      sy = ty;
      sz = enemies.posZ[best];
      dmg *= chain.damageMult;
    }
    void srcIdx;
  }

  private kill(i: number): void {
    this.alive[i] = 0;
    this.weaponRef[i] = null;
    this.activeCount--;
  }

  clear(): void {
    this.alive.fill(0);
    this.weaponRef.fill(null);
    this.activeCount = 0;
  }
}

const chainQueryScratch: number[] = [];
