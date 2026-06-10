/**
 * Per-frame enemy behavior: throttled AI thinking (steering, separation,
 * role actions), windup→strike resolution, exploder detonation, boss phases.
 * Operates on the EnemyManager's SoA arrays; module-level scratch keeps the
 * hot loop allocation-free.
 */

import type { EnemyConfig } from '../../config/types';
import type { CollisionWorld } from '../collision';
import type { GameBus } from '../events';
import type { Rng } from '../../core/Rng';
import type { EnemyProjectiles } from './enemyProjectiles';
import { EnemyManager, EState } from './EnemyManager';
import { thinkBoss } from './bossAI';
import { clamp, damp, dist2XZ, wrapAngle } from '../../core/math';

export interface EnemyUpdateCtx {
  dt: number;
  simTime: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  playerAlive: boolean;
  collision: CollisionWorld;
  rng: Rng;
  bus: GameBus;
  projectiles: EnemyProjectiles;
  damagePlayer: (amount: number, fromX: number, fromZ: number) => void;
  /** Chrono-field upgrade: slow enemies near the player. */
  slowAuraActive: boolean;
  /** AI LOD: disable to force frequent thinking (debug). */
  aiThrottle: boolean;
}

const neighborScratch: number[] = [];
const posScratch = { x: 0, z: 0 };

export function updateEnemies(mgr: EnemyManager, ctx: EnemyUpdateCtx): void {
  const { dt } = ctx;
  mgr.aiThinksThisFrame = 0;

  for (let i = 0; i < mgr.highWater; i++) {
    if (!mgr.aliveFlags[i]) continue;

    if (mgr.state[i] === EState.Dying) {
      mgr.deathTimer[i] -= dt;
      if (mgr.deathTimer[i] <= 0) mgr.freeSlot(i);
      continue;
    }

    const cfg = mgr.types[mgr.typeIdx[i]];

    // Fuse runs before status ticks so a burning exploder still detonates.
    if (mgr.state[i] === EState.Fuse) {
      mgr.fuse[i] -= dt;
      if (mgr.fuse[i] <= 0) detonate(mgr, i, cfg, ctx);
      continue;
    }

    // Status: dots and expiry
    const dot = mgr.status.tick(i, dt);
    if (dot > 0) {
      mgr.hp[i] -= dot;
      if (mgr.hp[i] <= 0) {
        mgr.kill(i, true, ctx.rng);
        continue;
      }
    }
    if (mgr.hitFlash[i] > 0) mgr.hitFlash[i] = Math.max(0, mgr.hitFlash[i] - dt * 4);

    if (mgr.attackCd[i] > 0) mgr.attackCd[i] -= dt;
    if (mgr.buffMult[i] > 1) mgr.buffMult[i] = Math.max(1, mgr.buffMult[i] - dt * 0.5);

    const stunned = mgr.status.isStunned(i);

    // Throttled AI think — closer enemies think more often
    mgr.aiTimer[i] -= dt;
    if (mgr.aiTimer[i] <= 0 && !stunned && ctx.playerAlive) {
      think(mgr, i, cfg, ctx);
      mgr.aiThinksThisFrame++;
      if (ctx.aiThrottle) {
        const d2 = dist2XZ(mgr.posX[i], mgr.posZ[i], ctx.playerX, ctx.playerZ);
        mgr.aiTimer[i] = (d2 < 15 * 15 ? 0.1 : d2 < 35 * 35 ? 0.25 : 0.5) * (0.8 + ((i * 0.37) % 0.4));
      } else {
        mgr.aiTimer[i] = 0.05;
      }
    }

    if (mgr.state[i] === EState.Windup) {
      mgr.windup[i] -= dt;
      if (mgr.windup[i] <= 0) strike(mgr, i, cfg, ctx);
    }

    // Movement integration (every tick)
    let speedMult = mgr.status.speedMult(i) * mgr.buffMult[i] * mgr.bossSpeedMult[i];
    if (ctx.slowAuraActive) {
      const d2 = dist2XZ(mgr.posX[i], mgr.posZ[i], ctx.playerX, ctx.playerZ);
      if (d2 < 12 * 12) speedMult *= 0.8;
    }
    if (stunned) speedMult = 0;
    else if (mgr.state[i] === EState.Windup) speedMult *= 0.25;

    if (mgr.state[i] === EState.Charging) {
      mgr.special[i] -= dt;
      if (mgr.special[i] <= 0) mgr.state[i] = EState.Chase;
      else speedMult *= 4;
    }

    mgr.velX[i] = damp(mgr.velX[i], mgr.desiredVX[i] * speedMult, cfg.accel * 0.6, dt);
    mgr.velZ[i] = damp(mgr.velZ[i], mgr.desiredVZ[i] * speedMult, cfg.accel * 0.6, dt);
    mgr.posX[i] += mgr.velX[i] * dt;
    mgr.posZ[i] += mgr.velZ[i] * dt;

    if (Math.abs(mgr.velX[i]) + Math.abs(mgr.velZ[i]) > 0.2) {
      const targetYaw = Math.atan2(-mgr.velX[i], -mgr.velZ[i]);
      mgr.yaw[i] += wrapAngle(targetYaw - mgr.yaw[i]) * Math.min(1, dt * 8);
    }
    mgr.animPhase[i] += dt * (1 + Math.abs(mgr.velX[i]) + Math.abs(mgr.velZ[i]));

    // World pushout on alternating ticks (halves static-collision cost)
    if (((i + ((ctx.simTime * 60) | 0)) & 1) === 0) {
      posScratch.x = mgr.posX[i];
      posScratch.z = mgr.posZ[i];
      ctx.collision.pushOutCircle(posScratch, cfg.radius * mgr.scale[i], 0.1, cfg.height * mgr.scale[i]);
      mgr.posX[i] = posScratch.x;
      mgr.posZ[i] = posScratch.z;
    }

    // Boss contact damage during charge
    if (mgr.state[i] === EState.Charging && ctx.playerAlive) {
      const d2 = dist2XZ(mgr.posX[i], mgr.posZ[i], ctx.playerX, ctx.playerZ);
      const r = cfg.radius * mgr.scale[i] + 1.0;
      if (d2 < r * r) {
        ctx.damagePlayer(mgr.damage[i], mgr.posX[i], mgr.posZ[i]);
        mgr.state[i] = EState.Chase;
        mgr.special[i] = 0;
      }
    }

    mgr.grid.update(i, mgr.posX[i], mgr.posZ[i]);
  }
}

function think(mgr: EnemyManager, i: number, cfg: EnemyConfig, ctx: EnemyUpdateCtx): void {
  const px = mgr.posX[i];
  const pz = mgr.posZ[i];
  const dx = ctx.playerX - px;
  const dz = ctx.playerZ - pz;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1e-5;

  if (mgr.state[i] === EState.Spawning) mgr.state[i] = EState.Chase;
  const aggro = dist < cfg.aggroRange;

  // Seek (or hold preferred range for ranged/support roles)
  let seekX = dx / dist;
  let seekZ = dz / dist;
  if (cfg.preferredRange && aggro) {
    if (dist < cfg.preferredRange * 0.75) {
      seekX = -seekX;
      seekZ = -seekZ;
    } else if (dist < cfg.preferredRange * 1.25) {
      const dir = (i & 1) === 0 ? 1 : -1; // strafe in the comfort band
      const tx = -seekZ * dir;
      const tz = seekX * dir;
      seekX = tx;
      seekZ = tz;
    }
  }

  // Separation (anti-clumping)
  const sepRadius = cfg.radius * mgr.scale[i] * 2.5 + 0.5;
  mgr.grid.queryCircle(px, pz, sepRadius, neighborScratch);
  let sepX = 0;
  let sepZ = 0;
  let sepCount = 0;
  for (let n = 0; n < neighborScratch.length && sepCount < 6; n++) {
    const j = neighborScratch[n];
    if (j === i || !mgr.aliveFlags[j] || mgr.state[j] === EState.Dying) continue;
    const ox = px - mgr.posX[j];
    const oz = pz - mgr.posZ[j];
    const od2 = ox * ox + oz * oz;
    if (od2 > 1e-9 && od2 < sepRadius * sepRadius) {
      const od = Math.sqrt(od2);
      const w = 1 - od / sepRadius;
      sepX += (ox / od) * w;
      sepZ += (oz / od) * w;
      sepCount++;
    }
  }

  let desX = seekX + sepX * 0.9;
  let desZ = seekZ + sepZ * 0.9;
  const desLen = Math.sqrt(desX * desX + desZ * desZ) || 1;
  mgr.desiredVX[i] = (desX / desLen) * mgr.speed[i];
  mgr.desiredVZ[i] = (desZ / desLen) * mgr.speed[i];

  if (!aggro || !ctx.playerAlive) return;

  switch (cfg.role) {
    case 'melee':
      if (dist < cfg.attackRange && mgr.attackCd[i] <= 0 && mgr.state[i] === EState.Chase) {
        mgr.state[i] = EState.Windup;
        mgr.windup[i] = cfg.attackWindup;
      }
      break;

    case 'exploder':
      if (dist < cfg.attackRange && cfg.explode) {
        mgr.state[i] = EState.Fuse;
        mgr.fuse[i] = cfg.explode.fuse;
        mgr.desiredVX[i] = 0;
        mgr.desiredVZ[i] = 0;
      }
      break;

    case 'ranged': {
      const eyeY = cfg.height * mgr.scale[i] * 0.8;
      mgr.losClear[i] = ctx.collision.losBlocked(px, eyeY, pz, ctx.playerX, ctx.playerY + 1.2, ctx.playerZ) ? 0 : 1;
      if (mgr.losClear[i] && dist < cfg.attackRange && mgr.attackCd[i] <= 0 && mgr.state[i] === EState.Chase) {
        mgr.state[i] = EState.Windup;
        mgr.windup[i] = cfg.attackWindup;
      }
      break;
    }

    case 'support':
      if (cfg.aura) {
        mgr.grid.queryCircle(px, pz, cfg.aura.radius, neighborScratch);
        for (let n = 0; n < neighborScratch.length; n++) {
          const j = neighborScratch[n];
          if (j === i || !mgr.aliveFlags[j] || mgr.state[j] === EState.Dying) continue;
          mgr.hp[j] = Math.min(mgr.maxHp[j], mgr.hp[j] + cfg.aura.healPerSec * 0.25);
          mgr.buffMult[j] = Math.max(mgr.buffMult[j], cfg.aura.speedMult);
        }
      }
      break;

    case 'boss':
      thinkBoss(mgr, i, cfg, ctx, dist);
      break;
  }
}

/** Windup finished — deliver the attack. */
function strike(mgr: EnemyManager, i: number, cfg: EnemyConfig, ctx: EnemyUpdateCtx): void {
  mgr.state[i] = EState.Chase;
  mgr.attackCd[i] = cfg.attackCooldown;
  if (!ctx.playerAlive) return;
  const dx = ctx.playerX - mgr.posX[i];
  const dz = ctx.playerZ - mgr.posZ[i];
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Boss slam: radial AoE
  if (cfg.role === 'boss' && mgr.special[i] === -1) {
    mgr.special[i] = 0;
    if (dist < 9) {
      const falloff = clamp(1 - dist / 9, 0.35, 1);
      ctx.damagePlayer(mgr.damage[i] * falloff, mgr.posX[i], mgr.posZ[i]);
    }
    mgr.bus.emit('explosion', { x: mgr.posX[i], y: 0.2, z: mgr.posZ[i], radius: 8 });
    return;
  }

  if (cfg.role === 'ranged' && cfg.projectile) {
    if (!mgr.losClear[i]) return;
    const py = mgr.posY[i] + cfg.height * mgr.scale[i] * 0.75;
    const len = dist || 1;
    const t = len / cfg.projectile.speed;
    const vy = (ctx.playerY + 1.1 - py) / t;
    ctx.projectiles.spawn(
      mgr.posX[i], py, mgr.posZ[i],
      (dx / len) * cfg.projectile.speed, vy, (dz / len) * cfg.projectile.speed,
      cfg.projectile.radius, cfg.projectile.damage, cfg.projectile.color,
    );
    mgr.bus.emit('enemy:attack', { enemyId: cfg.id, x: mgr.posX[i], z: mgr.posZ[i] });
    return;
  }

  if (dist < cfg.attackRange * 1.4) {
    ctx.damagePlayer(mgr.damage[i], mgr.posX[i], mgr.posZ[i]);
    mgr.bus.emit('enemy:attack', { enemyId: cfg.id, x: mgr.posX[i], z: mgr.posZ[i] });
  }
}

/** Exploder detonation: damages player AND other enemies (chain potential). */
function detonate(mgr: EnemyManager, i: number, cfg: EnemyConfig, ctx: EnemyUpdateCtx): void {
  const spec = cfg.explode;
  const x = mgr.posX[i];
  const z = mgr.posZ[i];
  const killedByPlayer = mgr.hp[i] <= 0;
  if (spec) {
    mgr.bus.emit('explosion', { x, y: 0.6, z, radius: spec.radius });
    const pd2 = dist2XZ(x, z, ctx.playerX, ctx.playerZ);
    if (ctx.playerAlive && pd2 < spec.radius * spec.radius) {
      const falloff = clamp(1 - Math.sqrt(pd2) / spec.radius, 0.3, 1);
      ctx.damagePlayer(spec.damage * falloff, x, z);
    }
    mgr.grid.queryCircle(x, z, spec.radius, neighborScratch);
    for (let n = 0; n < neighborScratch.length; n++) {
      const j = neighborScratch[n];
      if (j === i || !mgr.aliveFlags[j]) continue;
      mgr.applyDamage(j, spec.damage * 0.5, {
        fromX: x, fromZ: z, isHead: false, isCrit: false, byPlayer: killedByPlayer, weaponId: null,
      });
    }
  }
  mgr.state[i] = EState.Dying;
  mgr.deathTimer[i] = 0.5;
  mgr.grid.remove(i);
  mgr.bus.emit('enemy:died', {
    idx: i,
    enemyId: cfg.id,
    x,
    y: mgr.posY[i] + 0.5,
    z,
    xp: mgr.xpVal[i],
    score: mgr.scoreVal[i],
    currency: Math.round((cfg.currencyMin + cfg.currencyMax) / 2),
    isBoss: false,
    killedByPlayer,
  });
}
