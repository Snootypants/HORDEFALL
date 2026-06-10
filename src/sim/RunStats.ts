/**
 * Per-run statistics for the HUD, game-over summary, and achievements.
 * Mutated directly by sim systems (hot-path friendly), read by UI.
 */

export class RunStats {
  kills = 0;
  headshots = 0;
  bossKills = 0;
  damageDealt = 0;
  damageTaken = 0;
  shotsFired = 0;
  shotsHit = 0;
  creditsEarned = 0;
  pickupsCollected = 0;
  wavesSurvived = 0;
  timeSurvivedSec = 0;
  upgradesChosen: string[] = [];
  /** weaponId -> shots fired (favorite-weapon metric). */
  weaponShots = new Map<string, number>();
  /** weaponId -> kills. */
  weaponKills = new Map<string, number>();

  get accuracy(): number {
    return this.shotsFired === 0 ? 0 : this.shotsHit / this.shotsFired;
  }

  favoriteWeapon(): string {
    let best = 'pistol';
    let bestShots = -1;
    for (const [id, shots] of this.weaponShots) {
      if (shots > bestShots) {
        best = id;
        bestShots = shots;
      }
    }
    return best;
  }

  recordShot(weaponId: string): void {
    this.shotsFired++;
    this.weaponShots.set(weaponId, (this.weaponShots.get(weaponId) ?? 0) + 1);
  }

  recordKill(weaponId: string | null): void {
    this.kills++;
    if (weaponId) this.weaponKills.set(weaponId, (this.weaponKills.get(weaponId) ?? 0) + 1);
  }
}
