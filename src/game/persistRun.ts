/**
 * End-of-run bookkeeping: fold run results into the profile, high scores
 * (top 10), run history (last 20), and persisted weapon unlocks.
 */

import type { Simulation } from '../sim/Simulation';
import type { SaveDataV2 } from '../save/SaveManager';

export function persistRunResults(sim: Simulation, d: SaveDataV2): void {
  d.profile.totalRuns++;
  d.profile.totalKills += sim.stats.kills;
  d.profile.totalPlaytimeSec += sim.time;
  d.bestWave = Math.max(d.bestWave, sim.stats.wavesSurvived);

  d.highScores.push({
    score: sim.progression.score,
    wave: sim.stats.wavesSurvived,
    dateIso: new Date().toISOString(),
    mapId: sim.map.config.id,
  });
  d.highScores.sort((a, b) => b.score - a.score);
  d.highScores.length = Math.min(d.highScores.length, 10);

  d.runHistory.unshift({
    dateIso: new Date().toISOString(),
    mapId: sim.map.config.id,
    seed: sim.seed,
    score: sim.progression.score,
    wave: sim.stats.wavesSurvived,
    timeSurvivedSec: sim.stats.timeSurvivedSec,
    kills: sim.stats.kills,
    headshots: sim.stats.headshots,
    damageDealt: Math.round(sim.stats.damageDealt),
    damageTaken: Math.round(sim.stats.damageTaken),
    shotsFired: sim.stats.shotsFired,
    shotsHit: sim.stats.shotsHit,
    favoriteWeapon: sim.stats.favoriteWeapon(),
    level: sim.progression.level,
    upgradesChosen: [...sim.stats.upgradesChosen],
    bossKills: sim.stats.bossKills,
  });
  d.runHistory.length = Math.min(d.runHistory.length, 20);

  // Only profile-grade unlocks persist (shop purchases + defaults + prior
  // saves). Dev/tuning unlock cheats and tuning locks never touch this.
  d.unlocks.weapons = sim.weapons.persistedUnlocks();
}
