/**
 * Achievement tracking: compares run stats against config thresholds on the
 * cheap events (kills, wave clears, level-ups) and unlocks into the profile.
 */

import { ACHIEVEMENTS } from '../config/achievements';
import type { Simulation } from '../sim/Simulation';
import type { SaveDataV2 } from '../save/SaveManager';

export class AchievementTracker {
  private readonly unsubs: (() => void)[] = [];

  constructor(
    private readonly save: SaveDataV2,
    private readonly persist: () => void,
  ) {}

  wire(sim: Simulation): void {
    this.unwire();
    const check = (): void => this.checkAll(sim);
    this.unsubs.push(sim.bus.on('enemy:died', check));
    this.unsubs.push(sim.bus.on('wave:cleared', check));
    this.unsubs.push(sim.bus.on('player:levelup', check));
  }

  unwire(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
  }

  checkAll(sim: Simulation): void {
    const owned = this.save.profile.achievements;
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (owned.includes(a.id)) continue;
      const value = this.statValue(a.stat, sim);
      if (value >= a.threshold) {
        owned.push(a.id);
        changed = true;
        sim.bus.emit('achievement:unlocked', { id: a.id, name: a.name });
      }
    }
    if (changed) this.persist();
  }

  private statValue(stat: (typeof ACHIEVEMENTS)[number]['stat'], sim: Simulation): number {
    switch (stat) {
      case 'kills': return sim.stats.kills;
      case 'headshots': return sim.stats.headshots;
      case 'wavesSurvived': return sim.stats.wavesSurvived;
      case 'bossKills': return sim.stats.bossKills;
      case 'score': return sim.progression.score;
      case 'level': return sim.progression.level;
      case 'totalRuns': return this.save.profile.totalRuns;
    }
  }
}
