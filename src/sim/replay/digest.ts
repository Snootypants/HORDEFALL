/**
 * Simulation state digests for determinism checksums and replay desync
 * triage. Each subsystem folds to its own digest so a replay mismatch can
 * say WHICH system diverged; the full checksum hashes all of them.
 * String(number) round-trips float64 exactly — any drift changes the hash.
 *
 * COVERAGE: run scalars (time/credits/revives), full player pose+vitals,
 * every weapon's runtime + reload/cooldown/bloom, progression + upgrade
 * stacks, wave director public state (incl. queued-spawn count), master RNG
 * AND the named subsystem RNG streams registered by Simulation, enemies
 * (pos incl. Y/ground, hp, state, yaw, status fold), both projectile pools,
 * pickups, barrels, and companions.
 *
 * KNOWN LIMITATIONS: ad hoc forks (e.g. upgrade-choice rolls) are stateless
 * seed-derived Rngs, so they need no registration; the wave queue CONTENTS
 * are private (count only); Progression.lastKillTime is private (combo decay
 * surfaces via comboMult on later ticks). Deterministic within one engine —
 * cross-browser bitwise equality is NOT claimed.
 */

import type { Simulation } from '../Simulation';

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

type Parts = (number | string)[];

export function subsystemDigests(sim: Simulation): Record<string, string> {
  const out: Record<string, string> = {};
  const fold = (name: string, parts: Parts): void => {
    out[name] = fnv1a(parts.join('|'));
  };

  fold('run', [sim.time, sim.credits, sim.revivesLeft]);

  const p = sim.player;
  fold('player', [p.x, p.y, p.z, p.yaw, p.pitch, p.health, p.armor, p.stamina, p.alive ? 1 : 0]);

  const w = sim.weapons;
  const weaponParts: Parts = [w.currentId, w.reloading ? 1 : 0, w.reloadLeft, w.cooldown, w.bloom];
  for (const cfg of w.weapons) {
    const rt = w.runtime.get(cfg.id)!;
    weaponParts.push(cfg.id, rt.mag, rt.reserve, rt.tier, rt.unlocked ? 1 : 0);
  }
  fold('weapons', weaponParts);

  const prog = sim.progression;
  const progParts: Parts = [
    prog.level, prog.xp, prog.score, prog.pendingLevelUps, prog.comboMult, prog.killStreak,
  ];
  for (const [id, count] of [...sim.upgradeStacks.entries()].sort()) progParts.push(id, count);
  fold('progression', progParts);

  fold('waves', [
    sim.waves.wave, sim.waves.state, sim.waves.bossNumber, sim.waves.breakLeft,
    sim.waves.queuedSpawns, sim.waves.ammoDropMult, sim.waves.fogDensityMult,
  ]);

  const rngParts: Parts = ['master', sim.rng.stateSnapshot];
  for (const [name, rng] of sim.rngStreams) rngParts.push(name, rng.stateSnapshot);
  fold('rng', rngParts);

  const e = sim.enemies;
  const enemyParts: Parts = [e.aliveCount];
  for (let i = 0; i < e.highWater; i++) {
    if (!e.aliveFlags[i]) continue;
    enemyParts.push(i, e.posX[i], e.posY[i], e.groundY[i], e.posZ[i], e.hp[i], e.state[i], e.yaw[i], e.status.checksumOf(i));
  }
  fold('enemies', enemyParts);

  const projParts: Parts = [];
  const pp = sim.playerProjectiles;
  for (let i = 0; i < pp.alive.length; i++) {
    if (!pp.alive[i]) continue;
    projParts.push('pp', i, pp.posX[i], pp.posY[i], pp.posZ[i], pp.damage[i], pp.blastDamage[i], pp.life[i]);
  }
  const ep = sim.enemyProjectiles;
  for (let i = 0; i < ep.alive.length; i++) {
    if (!ep.alive[i]) continue;
    projParts.push('ep', i, ep.posX[i], ep.posY[i], ep.posZ[i], ep.damage[i], ep.life[i]);
  }
  fold('projectiles', projParts);

  const pk = sim.pickups;
  const pickupParts: Parts = [];
  for (let i = 0; i < pk.alive.length; i++) {
    if (!pk.alive[i]) continue;
    pickupParts.push(i, pk.posX[i], pk.posZ[i], pk.kindIdx[i], pk.life[i]);
  }
  fold('pickups', pickupParts);

  const b = sim.barrels;
  const barrelParts: Parts = [];
  for (let i = 0; i < b.count; i++) barrelParts.push(i, b.alive[i], b.hp[i]);
  fold('barrels', barrelParts);

  const compParts: Parts = [];
  for (const d of sim.companions.drones) compParts.push('d', d.x, d.y, d.z, d.fireLeft, d.orbitPhase);
  for (const t of sim.companions.turrets) compParts.push('t', t.x, t.z, t.yaw, t.fireLeft, t.active ? 1 : 0);
  fold('companions', compParts);

  fold('stats', [
    sim.stats.kills, sim.stats.shotsFired, sim.stats.damageDealt, sim.stats.damageTaken,
  ]);

  return out;
}

/** Full-state checksum: a fold of every subsystem digest. */
export function simChecksum(sim: Simulation): string {
  const digests = subsystemDigests(sim);
  const parts: string[] = [];
  for (const key of Object.keys(digests).sort()) parts.push(key, digests[key]);
  return fnv1a(parts.join('|'));
}
