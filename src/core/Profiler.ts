/**
 * Lightweight section profiler feeding the performance overlay. Sections are
 * begin/end pairs per frame; a rolling window gives smoothed averages
 * (AI cost, sim cost, render cost) without allocating per frame.
 */

const WINDOW = 60;

interface Section {
  startedAt: number;
  accumulated: number; // ms within current frame (multiple begin/end allowed)
  samples: Float32Array;
  sampleIndex: number;
  sampleCount: number;
  last: number;
}

export class Profiler {
  private sections = new Map<string, Section>();
  private readonly now: () => number;

  constructor(now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    this.now = now;
  }

  begin(name: string): void {
    let s = this.sections.get(name);
    if (!s) {
      s = { startedAt: 0, accumulated: 0, samples: new Float32Array(WINDOW), sampleIndex: 0, sampleCount: 0, last: 0 };
      this.sections.set(name, s);
    }
    s.startedAt = this.now();
  }

  end(name: string): void {
    const s = this.sections.get(name);
    if (!s) return;
    s.accumulated += this.now() - s.startedAt;
  }

  /** Call once per frame: commits accumulated section times as one sample. */
  frameDone(): void {
    for (const s of this.sections.values()) {
      s.last = s.accumulated;
      s.samples[s.sampleIndex] = s.accumulated;
      s.sampleIndex = (s.sampleIndex + 1) % WINDOW;
      if (s.sampleCount < WINDOW) s.sampleCount++;
      s.accumulated = 0;
    }
  }

  lastMs(name: string): number {
    return this.sections.get(name)?.last ?? 0;
  }

  averageMs(name: string): number {
    const s = this.sections.get(name);
    if (!s || s.sampleCount === 0) return 0;
    let sum = 0;
    for (let i = 0; i < s.sampleCount; i++) sum += s.samples[i];
    return sum / s.sampleCount;
  }

  sectionNames(): string[] {
    return [...this.sections.keys()];
  }
}
