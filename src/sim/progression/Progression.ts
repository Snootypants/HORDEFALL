/**
 * XP, levels, score, combo multiplier, and kill streaks. Pure sim state — UI
 * reads it, the Game orchestrator drains pendingLevelUps to open the upgrade
 * picker between fights.
 */

import { expCurve } from '../../core/math';
import type { ProgressionBalanceConfig } from '../../config/types';

/** XP needed to go from `level` to `level + 1`. */
export const xpForLevel = (level: number, cfg: ProgressionBalanceConfig): number =>
  Math.round(expCurve(cfg.xpBase, cfg.xpGrowth, level - 1));

export class Progression {
  private readonly cfg: ProgressionBalanceConfig;

  level = 1;
  xp = 0;
  score = 0;
  /** Level-ups earned but not yet spent on an upgrade choice. */
  pendingLevelUps = 0;

  comboMult = 1;
  private lastKillTime = -Infinity;
  killStreak = 0;
  private streakThresholdIndex = 0;

  constructor(cfg: ProgressionBalanceConfig) {
    this.cfg = cfg;
  }

  get xpToNext(): number {
    return xpForLevel(this.level, this.cfg);
  }

  addXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.pendingLevelUps++;
    }
  }

  /**
   * Record a kill at sim time `now`. Returns a kill-streak threshold value
   * when one is newly crossed (for announcements), else null.
   */
  registerKill(now: number): number | null {
    if (now - this.lastKillTime <= this.cfg.comboWindow) {
      this.comboMult = Math.min(this.cfg.comboMaxMult, this.comboMult + this.cfg.comboPerKill);
    }
    this.lastKillTime = now;
    this.killStreak++;
    const thresholds = this.cfg.killStreakThresholds;
    if (
      this.streakThresholdIndex < thresholds.length &&
      this.killStreak >= thresholds[this.streakThresholdIndex]
    ) {
      return thresholds[this.streakThresholdIndex++];
    }
    return null;
  }

  /** Call regularly with sim time; decays the combo after the window lapses. */
  tickCombo(now: number): void {
    if (now - this.lastKillTime > this.cfg.comboWindow) {
      this.comboMult = 1;
    }
  }

  /** Player took damage — streak resets (combo survives; streaks are about purity). */
  breakStreak(): void {
    this.killStreak = 0;
    this.streakThresholdIndex = 0;
  }

  /** Adds base score scaled by combo; returns the points actually gained. */
  addScore(base: number): number {
    const gained = Math.round(base * this.comboMult);
    this.score += gained;
    return gained;
  }

  consumePendingLevelUp(): boolean {
    if (this.pendingLevelUps <= 0) return false;
    this.pendingLevelUps--;
    return true;
  }
}
