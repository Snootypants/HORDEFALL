/**
 * Status effects in SoA layout: one flat Float32Array slab for N entities ×
 * M statuses (remaining duration + stacks). No per-entity objects, no
 * allocation during gameplay — built for 1000 concurrent enemies.
 */

import type { StatusEffectConfig, StatusId, StatusInteraction } from '../config/types';

export interface StatusReaction {
  result: StatusInteraction['result'];
  bonusDamage: number;
}

export class StatusStore {
  private readonly capacity: number;
  private readonly configs: StatusEffectConfig[];
  private readonly indexById = new Map<StatusId, number>();
  private readonly interactions: StatusInteraction[];
  /** remaining[entity * M + status] seconds; 0 = inactive. */
  private readonly remaining: Float32Array;
  private readonly stacks: Float32Array;
  private readonly reactionScratch: StatusReaction = { result: 'shatter', bonusDamage: 0 };

  constructor(capacity: number, configs: StatusEffectConfig[], interactions: StatusInteraction[]) {
    this.capacity = capacity;
    this.configs = configs;
    this.interactions = interactions;
    configs.forEach((c, i) => this.indexById.set(c.id, i));
    this.remaining = new Float32Array(capacity * configs.length);
    this.stacks = new Float32Array(capacity * configs.length);
  }

  private slot(entity: number, statusIndex: number): number {
    return entity * this.configs.length + statusIndex;
  }

  /**
   * Apply a status. If a configured interaction partner is already active,
   * both are consumed and the reaction (with bonus damage) is returned.
   */
  apply(entity: number, id: StatusId): StatusReaction | null {
    const idx = this.indexById.get(id);
    if (idx === undefined || entity < 0 || entity >= this.capacity) return null;

    for (const inter of this.interactions) {
      let partner: StatusId | null = null;
      if (inter.a === id) partner = inter.b;
      else if (inter.b === id) partner = inter.a;
      if (!partner) continue;
      const pIdx = this.indexById.get(partner);
      if (pIdx === undefined) continue;
      if (this.remaining[this.slot(entity, pIdx)] > 0) {
        // Consume the partner; the incoming status is spent on the reaction.
        this.remaining[this.slot(entity, pIdx)] = 0;
        this.stacks[this.slot(entity, pIdx)] = 0;
        this.reactionScratch.result = inter.result;
        this.reactionScratch.bonusDamage = inter.bonusDamage;
        return this.reactionScratch;
      }
    }

    const cfg = this.configs[idx];
    const s = this.slot(entity, idx);
    this.remaining[s] = cfg.duration;
    this.stacks[s] = Math.min(cfg.maxStacks, this.stacks[s] + 1);
    return null;
  }

  /** Advance timers for one entity; returns dot damage accrued over dt. */
  tick(entity: number, dt: number): number {
    let damage = 0;
    const m = this.configs.length;
    const base = entity * m;
    for (let i = 0; i < m; i++) {
      const s = base + i;
      if (this.remaining[s] <= 0) continue;
      const cfg = this.configs[i];
      const active = Math.min(dt, this.remaining[s]);
      damage += cfg.dps * this.stacks[s] * active;
      this.remaining[s] -= dt;
      if (this.remaining[s] <= 0) {
        this.remaining[s] = 0;
        this.stacks[s] = 0;
      }
    }
    return damage;
  }

  has(entity: number, id: StatusId): boolean {
    const idx = this.indexById.get(id);
    if (idx === undefined) return false;
    return this.remaining[this.slot(entity, idx)] > 0;
  }

  /** Strongest (lowest) speed multiplier among active statuses; stun → 0. */
  speedMult(entity: number): number {
    let mult = 1;
    const m = this.configs.length;
    const base = entity * m;
    for (let i = 0; i < m; i++) {
      if (this.remaining[base + i] <= 0) continue;
      const cfg = this.configs[i];
      if (cfg.immobilize) return 0;
      if (cfg.speedMult < mult) mult = cfg.speedMult;
    }
    return mult;
  }

  isStunned(entity: number): boolean {
    const m = this.configs.length;
    const base = entity * m;
    for (let i = 0; i < m; i++) {
      if (this.remaining[base + i] > 0 && this.configs[i].immobilize) return true;
    }
    return false;
  }

  /** Reset an entity completely (slot recycling on death/spawn). */
  clear(entity: number): void {
    const m = this.configs.length;
    const base = entity * m;
    for (let i = 0; i < m; i++) {
      this.remaining[base + i] = 0;
      this.stacks[base + i] = 0;
    }
  }

  /** Collect active status ids into `out` (truncated). Returns count. */
  activeIds(entity: number, out: string[]): number {
    out.length = 0;
    const m = this.configs.length;
    const base = entity * m;
    for (let i = 0; i < m; i++) {
      if (this.remaining[base + i] > 0) out.push(this.configs[i].id);
    }
    return out.length;
  }

  /** First active status color for tinting, or null. */
  tintColor(entity: number): number | null {
    const m = this.configs.length;
    const base = entity * m;
    for (let i = 0; i < m; i++) {
      if (this.remaining[base + i] > 0) return this.configs[i].color;
    }
    return null;
  }
}
