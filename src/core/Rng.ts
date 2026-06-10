/**
 * Seeded deterministic RNG (mulberry32). The simulation must never call
 * Math.random() — every system forks its own named stream from the run seed so
 * replays/daily challenges stay reproducible and streams don't perturb each
 * other (multiplayer/replay-ready determinism hook).
 */

export const hashStringToSeed = (s: string): number => {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Stable seed for a calendar day (UTC) — daily challenge support. */
export const dailySeed = (date: Date): number => {
  const key = `daily-${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  return hashStringToSeed(key);
};

export class Rng {
  private state: number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed === 0 ? 0x9e3779b9 : this.seed;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  chance(probability: number): boolean {
    if (probability >= 1) return true;
    if (probability <= 0) return false;
    return this.next() < probability;
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Derive an independent stream. Forking is a pure function of (seed, name)
   * and does not advance this generator's state.
   */
  fork(name: string): Rng {
    return new Rng((this.seed ^ hashStringToSeed(name)) >>> 0);
  }
}
