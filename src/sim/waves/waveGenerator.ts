/**
 * Procedural wave composition. Pure function of (wave number, rng, configs,
 * prior performance, player level) — deterministic per seed, which makes
 * daily challenges and run replays possible.
 */

import type {
  EnemyConfig,
  WaveBalanceConfig,
  WaveEventConfig,
  WaveEventId,
} from '../../config/types';
import type { Rng } from '../../core/Rng';
import { clamp, clamp01, expCurve, lerp } from '../../core/math';
import { BOSS_ID } from '../../config/enemies';

export interface WavePerformance {
  clearTimeSec: number;
  damageTaken: number;
}

export interface WaveEntry {
  enemyId: string;
  count: number;
  elite: boolean;
}

export interface GeneratedWave {
  wave: number;
  eventId: WaveEventId;
  eventName: string;
  eventDescription: string;
  isBoss: boolean;
  budget: number;
  entries: WaveEntry[];
  fogDensityMult: number;
  ammoDropMult: number;
}

export interface GenerateWaveOptions {
  wave: number;
  rng: Rng;
  enemies: EnemyConfig[];
  events: WaveEventConfig[];
  balance: WaveBalanceConfig;
  playerLevel: number;
  performance: WavePerformance | null;
  /** Dev tools / tests: force a specific event instead of rolling. */
  forcedEventId?: WaveEventId;
}

function performanceMult(perf: WavePerformance | null, balance: WaveBalanceConfig): number {
  if (!perf) return 1;
  // Fast clears with little damage taken push toward perfBudgetMax.
  const speedScore = clamp01(1 - perf.clearTimeSec / 120);
  const healthScore = clamp01(1 - perf.damageTaken / 150);
  const norm = speedScore * 0.5 + healthScore * 0.5;
  return lerp(balance.perfBudgetMin, balance.perfBudgetMax, norm);
}

function rollEvent(
  wave: number,
  rng: Rng,
  events: WaveEventConfig[],
): WaveEventConfig {
  const pool = events.filter((e) => e.weight > 0 && e.minWave <= wave);
  const fallback = events.find((e) => e.id === 'normal') ?? events[0];
  if (pool.length === 0) return fallback;
  let total = 0;
  for (const e of pool) total += e.weight;
  let roll = rng.next() * total;
  for (const e of pool) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return pool[pool.length - 1];
}

export function generateWave(opts: GenerateWaveOptions): GeneratedWave {
  const { wave, rng, enemies, events, balance, playerLevel, performance } = opts;

  const isBoss = balance.bossEvery > 0 && wave % balance.bossEvery === 0;
  let event: WaveEventConfig;
  if (opts.forcedEventId) {
    event = events.find((e) => e.id === opts.forcedEventId) ?? events[0];
  } else if (isBoss) {
    event = events.find((e) => e.id === 'boss') ?? events[0];
  } else {
    event = rollEvent(wave, rng, events);
  }

  const w = wave - 1;
  let budget =
    (balance.baseBudget + balance.budgetPerWave * w) *
    expCurve(1, balance.budgetGrowth, w) *
    event.budgetMult *
    performanceMult(performance, balance) *
    (1 + 0.02 * Math.max(0, playerLevel - 1));
  budget = Math.round(budget);

  // Budget-pickable pool for this wave.
  let pool = enemies.filter((e) => e.cost > 0 && e.weight > 0 && e.minWave <= wave);
  if (event.swarmBias && pool.length > 1) {
    // Swarm: only the cheapest half of the pool, so the budget buys bodies.
    const sorted = [...pool].sort((a, b) => a.cost - b.cost);
    pool = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  }

  const counts = new Map<string, number>();
  let remaining = budget;
  let guard = 10_000;
  while (pool.some((e) => e.cost <= remaining) && guard-- > 0) {
    const affordable = pool.filter((e) => e.cost <= remaining);
    let totalWeight = 0;
    for (const e of affordable) totalWeight += e.weight;
    let roll = rng.next() * totalWeight;
    let picked = affordable[affordable.length - 1];
    for (const e of affordable) {
      roll -= e.weight;
      if (roll <= 0) {
        picked = e;
        break;
      }
    }
    counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1);
    remaining -= picked.cost;
  }

  const eliteChance = event.eliteChance ?? 0;
  const entries: WaveEntry[] = [];
  for (const [enemyId, count] of counts) {
    if (eliteChance > 0) {
      // Split into elite and normal sub-entries.
      let elites = 0;
      for (let i = 0; i < count; i++) if (rng.chance(eliteChance)) elites++;
      if (elites > 0) entries.push({ enemyId, count: elites, elite: true });
      if (count - elites > 0) entries.push({ enemyId, count: count - elites, elite: false });
    } else {
      entries.push({ enemyId, count, elite: false });
    }
  }

  if (isBoss || event.id === 'boss') {
    entries.push({ enemyId: BOSS_ID, count: 1, elite: false });
  }

  // Safety: a wave must never be empty.
  if (entries.length === 0) {
    const cheapest = [...enemies]
      .filter((e) => e.cost > 0)
      .sort((a, b) => a.cost - b.cost)[0];
    if (cheapest) entries.push({ enemyId: cheapest.id, count: clamp(Math.round(budget / cheapest.cost), 3, 50), elite: false });
  }

  return {
    wave,
    eventId: event.id,
    eventName: event.name,
    eventDescription: event.description,
    isBoss: isBoss || event.id === 'boss',
    budget,
    entries,
    fogDensityMult: event.fogDensityMult ?? 1,
    ammoDropMult: event.ammoDropMult ?? 1,
  };
}
