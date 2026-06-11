/**
 * Headless run harness: a deterministic input-command script and a full-state
 * checksum, used to prove real runs execute headlessly and that same seed +
 * same command stream reproduces the same simulation bit-for-bit.
 */

import { Simulation } from '../../src/sim/Simulation';
import { neutralInput, resetFrameEdges, type InputCommand } from '../../src/sim/inputCommand';
import { EState } from '../../src/sim/enemies/EnemyManager';
import { wrapAngle } from '../../src/core/math';

/** FNV-1a over a string; stable, fast, plenty for state comparison. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Simulation state checksum. String(number) round-trips float64 exactly, so
 * any drift in any included field changes the hash.
 *
 * COVERAGE: time/credits/revives, full player pose+vitals, EVERY weapon's
 * runtime (mag/reserve/tier/unlocked) + reload/cooldown/bloom, progression
 * (level/xp/score/pending/combo/streak) + upgrade stacks, wave director
 * public state incl. queued-spawn count, master RNG state, enemies (pos/hp/
 * state/yaw + per-entity status fold), both projectile pools, pickups,
 * barrels, and companion drones/turrets.
 *
 * KNOWN LIMITATIONS (documented, not hash-covered): subsystem RNG forks
 * (weapons/waves/AI hold private Rng instances — only the master sim.rng is
 * included; fork divergence still surfaces through the state it perturbs),
 * the wave queue CONTENTS (only its count is public), and Progression's
 * private lastKillTime (combo decay surfaces via comboMult on later ticks).
 * This is checksum-grade determinism evidence, not a replay-grade full
 * state serialization.
 */
export function simChecksum(sim: Simulation): string {
  const parts: (number | string)[] = [
    sim.time, sim.credits, sim.revivesLeft,
    sim.player.x, sim.player.y, sim.player.z, sim.player.yaw, sim.player.pitch,
    sim.player.health, sim.player.armor, sim.player.stamina, sim.player.alive ? 1 : 0,
    sim.progression.level, sim.progression.xp, sim.progression.score,
    sim.progression.pendingLevelUps, sim.progression.comboMult, sim.progression.killStreak,
    sim.waves.wave, sim.waves.state, sim.waves.bossNumber, sim.waves.breakLeft,
    sim.waves.queuedSpawns, sim.waves.ammoDropMult, sim.waves.fogDensityMult,
    sim.rng.stateSnapshot,
    sim.weapons.currentId, sim.weapons.reloading ? 1 : 0, sim.weapons.reloadLeft,
    sim.weapons.cooldown, sim.weapons.bloom,
    sim.stats.kills, sim.stats.shotsFired, sim.stats.damageDealt, sim.stats.damageTaken,
    sim.enemies.aliveCount,
  ];
  // Every weapon's runtime, not just the current one.
  for (const w of sim.weapons.weapons) {
    const rt = sim.weapons.runtime.get(w.id)!;
    parts.push(w.id, rt.mag, rt.reserve, rt.tier, rt.unlocked ? 1 : 0);
  }
  for (const [id, count] of [...sim.upgradeStacks.entries()].sort()) parts.push(id, count);

  const e = sim.enemies;
  for (let i = 0; i < e.highWater; i++) {
    if (!e.aliveFlags[i]) continue;
    parts.push(i, e.posX[i], e.posY[i], e.groundY[i], e.posZ[i], e.hp[i], e.state[i], e.yaw[i], e.status.checksumOf(i));
  }
  const pp = sim.playerProjectiles;
  for (let i = 0; i < pp.alive.length; i++) {
    if (!pp.alive[i]) continue;
    parts.push('pp', i, pp.posX[i], pp.posY[i], pp.posZ[i], pp.damage[i], pp.blastDamage[i], pp.life[i]);
  }
  const ep = sim.enemyProjectiles;
  for (let i = 0; i < ep.alive.length; i++) {
    if (!ep.alive[i]) continue;
    parts.push('ep', i, ep.posX[i], ep.posY[i], ep.posZ[i], ep.damage[i], ep.life[i]);
  }
  const pk = sim.pickups;
  for (let i = 0; i < pk.alive.length; i++) {
    if (!pk.alive[i]) continue;
    parts.push('pk', i, pk.posX[i], pk.posZ[i], pk.kindIdx[i], pk.life[i]);
  }
  const b = sim.barrels;
  for (let i = 0; i < b.count; i++) parts.push('b', i, b.alive[i], b.hp[i]);
  for (const d of sim.companions.drones) parts.push('d', d.x, d.y, d.z, d.fireLeft, d.orbitPhase);
  for (const t of sim.companions.turrets) parts.push('t', t.x, t.z, t.yaw, t.fireLeft, t.active ? 1 : 0);
  return fnv1a(parts.join('|'));
}

/**
 * Deterministic command script: pure function of the tick index. Moves,
 * sprints, strafes, turns, fires in bursts, reloads, and cycles weapons —
 * enough to exercise the whole input → weapons → combat path.
 */
export function scriptedCommand(tick: number, cmd: InputCommand): InputCommand {
  resetFrameEdges(cmd);
  cmd.moveZ = Math.sin(tick / 120) > -0.6 ? 1 : 0;
  cmd.moveX = Math.sin(tick / 200) > 0 ? 1 : -1;
  cmd.sprint = tick % 400 < 150;
  cmd.crouch = false;
  cmd.lookDX = 0.01 * Math.sin(tick / 90);
  cmd.lookDY = 0.002 * Math.sin(tick / 130);
  cmd.fire = tick % 90 < 35;
  cmd.firePressed = tick % 90 === 0;
  cmd.aim = tick % 300 < 80;
  cmd.reload = tick % 480 === 0;
  cmd.jump = tick % 540 === 0;
  cmd.weaponSlot = -1;
  cmd.weaponDelta = 0;
  return cmd;
}

export interface DriveResult {
  wavesCleared: number;
  ticks: number;
  gameOver: boolean;
}

/**
 * Aim the look deltas at the nearest live enemy (what a player's hands do),
 * so scripted fire produces real hitscan kills through combat/onHit. Pure
 * function of deterministic sim state → still deterministic.
 */
function aimAtNearestEnemy(sim: Simulation, cmd: InputCommand): boolean {
  const e = sim.enemies;
  const p = sim.player;
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < e.highWater; i++) {
    if (!e.aliveFlags[i] || e.state[i] === EState.Dying) continue;
    const dx = e.posX[i] - p.x;
    const dz = e.posZ[i] - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  if (best < 0) return false;
  const dx = e.posX[best] - p.x;
  const dz = e.posZ[best] - p.z;
  const dist = Math.sqrt(bestD2) || 1e-5;
  const targetYaw = Math.atan2(-dx, -dz);
  const cfg = e.configOf(best);
  const targetY = e.posY[best] + cfg.height * e.scale[best] * 0.55;
  const targetPitch = Math.atan2(targetY - p.eyeY, dist);
  cmd.lookDX = wrapAngle(p.yaw - targetYaw);
  cmd.lookDY = p.pitch - targetPitch;
  return true;
}

/**
 * Organic combat: aimed scripted fire only — no force-kills, no break/wave
 * manipulation. Returns whether wave 1 was fully cleared by weapon fire.
 */
export function driveOrganicWave(sim: Simulation, maxTicks = 30_000): { cleared: boolean; ticks: number } {
  const DT = 1 / 60;
  const cmd = neutralInput();
  let cleared = false;
  sim.bus.on('wave:cleared', (e) => { if (e.wave === 1) cleared = true; });
  let tick = 0;
  for (; tick < maxTicks && !cleared; tick++) {
    scriptedCommand(tick, cmd);
    if (aimAtNearestEnemy(sim, cmd)) {
      cmd.fire = true;
      cmd.firePressed = tick % 8 === 0;
    }
    sim.tick(DT, cmd);
  }
  return { cleared, ticks: tick };
}

/**
 * HARNESS run (not an organic playthrough): scripted aimed input every tick,
 * but breaks are skipped and waves are force-cleared via the real kill path
 * (killAll → rewards/XP/drops) a few seconds after going active. This keeps
 * a 10-wave pass fast and deterministic while still ticking every system;
 * organic combat is proven separately by driveOrganicWave.
 */
export function driveRun(sim: Simulation, targetWaves: number, maxTicks = 90_000): DriveResult {
  const DT = 1 / 60;
  const cmd = neutralInput();
  let wavesCleared = 0;
  let gameOver = false;
  sim.bus.on('wave:cleared', () => wavesCleared++);
  sim.bus.on('run:gameover', () => { gameOver = true; });

  let activeTicks = 0;
  let tick = 0;
  for (; tick < maxTicks && wavesCleared < targetWaves && !gameOver; tick++) {
    if (sim.waves.state === 'break') {
      // Shop semantics during the break: spend earned credits on health and
      // armor (exactly what buyShopItem applies, minus the purchase sound).
      while (sim.credits >= 100 && sim.player.health < sim.player.maxHealth) {
        sim.credits -= 100;
        sim.player.heal(50);
      }
      while (sim.credits >= 100 && sim.player.armor < sim.player.maxArmor) {
        sim.credits -= 100;
        sim.player.addArmor(50);
      }
      sim.waves.skipBreak();
    }
    if (sim.waves.state === 'active' || sim.waves.state === 'spawning') {
      activeTicks++;
      // Force-clear leash (this is a HARNESS, see header): clear after a
      // short combat window, or immediately when the scripted player is
      // about to die — cache-unlocked guns raise powerScore, which scales
      // later waves beyond what scripted aim survives organically.
      const panic = sim.player.health < 45 && sim.player.armor <= 0;
      if (activeTicks > 1.8 * 60 || panic) {
        sim.enemies.killAll(true, sim.rng);
        activeTicks = 0;
      }
    } else {
      activeTicks = 0;
    }
    scriptedCommand(tick, cmd);
    if (aimAtNearestEnemy(sim, cmd)) {
      cmd.fire = true;
      cmd.firePressed = tick % 8 === 0;
    }
    sim.tick(DT, cmd);
  }
  return { wavesCleared, ticks: tick, gameOver };
}
