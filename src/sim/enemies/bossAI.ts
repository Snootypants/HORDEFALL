/**
 * Boss think: HP-fraction phase selection (speed multiplier + attack pool +
 * cooldown per phase) and attack initiation. Strike resolution stays in
 * enemyAI — bosses share the common windup→strike path.
 */

import type { EnemyConfig } from '../../config/types';
import type { EnemyUpdateCtx } from './enemyAI';
import { EnemyManager, EState } from './EnemyManager';

export function thinkBoss(mgr: EnemyManager, i: number, cfg: EnemyConfig, ctx: EnemyUpdateCtx, dist: number): void {
  const boss = cfg.boss;
  if (!boss) return;
  const frac = mgr.hp[i] / mgr.maxHp[i];
  let phaseIdx = boss.phases.length - 1;
  for (let p = 0; p < boss.phases.length; p++) {
    if (frac > boss.phases[p].untilHpFraction) {
      phaseIdx = p;
      break;
    }
  }
  if (phaseIdx !== mgr.bossPhase[i]) {
    mgr.bossPhase[i] = phaseIdx;
    mgr.bus.emit('boss:phase', { phase: phaseIdx + 1 });
  }
  const phase = boss.phases[phaseIdx];
  mgr.bossSpeedMult[i] = phase.speedMult;

  if (mgr.attackCd[i] > 0 || mgr.state[i] !== EState.Chase) return;

  const attack = phase.attacks[ctx.rng.int(0, phase.attacks.length - 1)];
  switch (attack) {
    case 'slam':
      if (dist < 8) {
        mgr.state[i] = EState.Windup;
        mgr.windup[i] = cfg.attackWindup;
        mgr.special[i] = -1;
        mgr.attackCd[i] = phase.attackCooldown;
        mgr.bus.emit('boss:attack', { attack: 'slam' });
      }
      break;
    case 'barrage':
      if (cfg.projectile && dist > 6) {
        const py = mgr.posY[i] + cfg.height * mgr.scale[i] * 0.7;
        for (let s = 0; s < 8; s++) {
          const spread = (s - 3.5) * 0.09;
          const dx = ctx.playerX - mgr.posX[i];
          const dz = ctx.playerZ - mgr.posZ[i];
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          const cos = Math.cos(spread);
          const sin = Math.sin(spread);
          const vx = ((dx * cos - dz * sin) / len) * cfg.projectile.speed;
          const vz = ((dx * sin + dz * cos) / len) * cfg.projectile.speed;
          const vy = (ctx.playerY + 1.2 - py) / (dist / cfg.projectile.speed);
          ctx.projectiles.spawn(mgr.posX[i], py, mgr.posZ[i], vx, vy, vz, cfg.projectile.radius, cfg.projectile.damage, cfg.projectile.color);
        }
        mgr.attackCd[i] = phase.attackCooldown;
        mgr.bus.emit('boss:attack', { attack: 'barrage' });
      }
      break;
    case 'summon':
      if (mgr.spawnMinionFn) {
        for (let s = 0; s < 4; s++) {
          const a = ctx.rng.range(0, Math.PI * 2);
          mgr.spawnMinionFn(boss.summons, mgr.posX[i] + Math.cos(a) * 4, mgr.posZ[i] + Math.sin(a) * 4, mgr.waveTag[i]);
        }
        mgr.attackCd[i] = phase.attackCooldown;
        mgr.bus.emit('boss:attack', { attack: 'summon' });
      }
      break;
    case 'charge':
      if (dist > 8) {
        mgr.state[i] = EState.Charging;
        mgr.special[i] = 1.4;
        mgr.attackCd[i] = phase.attackCooldown;
        mgr.bus.emit('boss:attack', { attack: 'charge' });
      }
      break;
  }
}
