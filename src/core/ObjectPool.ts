/**
 * Generic object pool. Everything transient in the game (projectiles,
 * particles, decals, damage numbers, pickups, sounds-in-flight) lives in a
 * pool so hot paths never allocate. acquire() returns null when the pool is
 * exhausted — callers treat that as "effect dropped", never as an error.
 */

export interface ObjectPoolOptions<T> {
  name: string;
  create: () => T;
  /** Restore an instance to its pristine state before reuse. */
  reset: (obj: T) => void;
  initialSize?: number;
  maxSize?: number;
}

export interface PoolStats {
  name: string;
  free: number;
  inUse: number;
  created: number;
  maxSize: number;
}

export class ObjectPool<T extends object> {
  readonly name: string;
  private readonly create: () => T;
  private readonly resetFn: (obj: T) => void;
  private readonly maxSize: number;
  private free: T[] = [];
  private inUseSet = new Set<T>();
  private created = 0;

  constructor(opts: ObjectPoolOptions<T>) {
    this.name = opts.name;
    this.create = opts.create;
    this.resetFn = opts.reset;
    this.maxSize = opts.maxSize ?? Infinity;
    const initial = Math.min(opts.initialSize ?? 0, this.maxSize);
    for (let i = 0; i < initial; i++) {
      this.free.push(this.create());
      this.created++;
    }
  }

  acquire(): T | null {
    let obj = this.free.pop();
    if (!obj) {
      if (this.created >= this.maxSize) return null;
      obj = this.create();
      this.created++;
    }
    this.inUseSet.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.inUseSet.delete(obj)) return; // double-release guard
    this.resetFn(obj);
    this.free.push(obj);
  }

  releaseAll(): void {
    for (const obj of this.inUseSet) {
      this.resetFn(obj);
      this.free.push(obj);
    }
    this.inUseSet.clear();
  }

  /** Iterate live objects (e.g. to tick active particles). */
  forEachInUse(fn: (obj: T) => void): void {
    for (const obj of this.inUseSet) fn(obj);
  }

  stats(): PoolStats {
    return {
      name: this.name,
      free: this.free.length,
      inUse: this.inUseSet.size,
      created: this.created,
      maxSize: this.maxSize,
    };
  }
}
