/**
 * Fixed-timestep accumulator. The simulation always steps in exact dt
 * increments (default 60 Hz) regardless of display refresh — a determinism
 * hook and the seam a future authoritative server would own. Rendering reads
 * `alpha` to interpolate between the last two sim states if desired.
 */

export class FixedTimestepLoop {
  readonly stepDt: number;
  private readonly step: (dt: number) => void;
  private readonly maxStepsPerAdvance: number;
  private accumulator = 0;

  constructor(stepDt: number, step: (dt: number) => void, maxStepsPerAdvance = 5) {
    this.stepDt = stepDt;
    this.step = step;
    this.maxStepsPerAdvance = maxStepsPerAdvance;
  }

  /** Feed real elapsed time; runs 0..maxSteps fixed steps. */
  advance(elapsed: number): void {
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= this.stepDt && steps < this.maxStepsPerAdvance) {
      this.step(this.stepDt);
      this.accumulator -= this.stepDt;
      steps++;
    }
    // Drop unprocessable backlog after a huge spike (tab was backgrounded).
    if (steps >= this.maxStepsPerAdvance && this.accumulator > this.stepDt) {
      this.accumulator = this.accumulator % this.stepDt;
    }
  }

  /** Fraction [0,1) of a step left in the accumulator, for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.stepDt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
