/**
 * Runtime config validation. Runs at startup (Game boot) and prints a report
 * to the console/dev console. Errors mean the data is unplayable; warnings
 * are balance smells. Tests inject synthetic config sets via
 * validateConfigSet; the game calls validateAllConfigs().
 */

import type {
  BalanceConfig,
  EnemyConfig,
  UpgradeConfig,
  WaveEventConfig,
  WeaponConfig,
} from './types';
import { WEAPONS } from './weapons';
import { ENEMIES } from './enemies';
import { UPGRADES } from './upgrades';
import { WAVE_EVENTS } from './waves';
import { BALANCE } from './balance';

export interface ConfigSet {
  weapons: WeaponConfig[];
  enemies: EnemyConfig[];
  upgrades: UpgradeConfig[];
  waveEvents: WaveEventConfig[];
  balance: BalanceConfig;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  checked: { weapons: number; enemies: number; upgrades: number; waveEvents: number };
}

const positive = (errors: string[], owner: string, field: string, v: number): void => {
  if (!(typeof v === 'number' && isFinite(v) && v > 0)) {
    errors.push(`${owner}: ${field} must be > 0 (got ${v})`);
  }
};

const nonNegative = (errors: string[], owner: string, field: string, v: number): void => {
  if (!(typeof v === 'number' && isFinite(v) && v >= 0)) {
    errors.push(`${owner}: ${field} must be >= 0 (got ${v})`);
  }
};

const uniqueIds = (errors: string[], kind: string, ids: string[]): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${kind}: duplicate id "${id}"`);
    seen.add(id);
  }
};

export function validateConfigSet(set: ConfigSet): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Weapons -------------------------------------------------------------
  uniqueIds(errors, 'weapons', set.weapons.map((w) => w.id));
  const slots = new Set<number>();
  for (const w of set.weapons) {
    const tag = `weapon "${w.id}"`;
    positive(errors, tag, 'damage', w.damage);
    positive(errors, tag, 'rpm', w.rpm);
    positive(errors, tag, 'magSize', w.magSize);
    positive(errors, tag, 'reloadTime', w.reloadTime);
    positive(errors, tag, 'pellets', w.pellets);
    positive(errors, tag, 'range', w.range);
    nonNegative(errors, tag, 'spreadDeg', w.spreadDeg);
    nonNegative(errors, tag, 'pierce', w.pierce);
    nonNegative(errors, tag, 'unlockCost', w.unlockCost);
    if (slots.has(w.slot)) errors.push(`${tag}: slot ${w.slot} already taken`);
    slots.add(w.slot);
    if (w.kind === 'projectile' && !w.projectile) {
      errors.push(`${tag}: kind is "projectile" but no projectile spec defined`);
    }
    if (w.projectile) {
      positive(errors, tag, 'projectile.speed', w.projectile.speed);
      positive(errors, tag, 'projectile.lifetime', w.projectile.lifetime);
    }
    if (w.falloffMinMult < 0 || w.falloffMinMult > 1) {
      errors.push(`${tag}: falloffMinMult must be within [0,1]`);
    }
    for (const [i, tier] of w.upgrades.entries()) {
      nonNegative(errors, tag, `upgrades[${i}].cost`, tier.cost);
    }
    if (w.upgrades.length === 0) warnings.push(`${tag}: has no upgrade path`);
  }
  if (!set.weapons.some((w) => w.unlockedByDefault)) {
    errors.push('weapons: at least one weapon must be unlockedByDefault');
  }

  // --- Enemies -------------------------------------------------------------
  uniqueIds(errors, 'enemies', set.enemies.map((e) => e.id));
  const enemyIds = new Set(set.enemies.map((e) => e.id));
  for (const e of set.enemies) {
    const tag = `enemy "${e.id}"`;
    positive(errors, tag, 'hp', e.hp);
    positive(errors, tag, 'speed', e.speed);
    positive(errors, tag, 'radius', e.radius);
    positive(errors, tag, 'height', e.height);
    nonNegative(errors, tag, 'damage', e.damage);
    positive(errors, tag, 'minWave', e.minWave);
    nonNegative(errors, tag, 'cost', e.cost);
    nonNegative(errors, tag, 'weight', e.weight);
    nonNegative(errors, tag, 'xp', e.xp);
    if (e.headshotZone <= 0 || e.headshotZone >= 1) {
      errors.push(`${tag}: headshotZone must be within (0,1)`);
    }
    if (e.role === 'ranged' && !e.projectile) {
      errors.push(`${tag}: ranged role requires a projectile spec`);
    }
    if (e.role === 'exploder' && !e.explode) {
      errors.push(`${tag}: exploder role requires an explode spec`);
    }
    if (e.boss) {
      if (!enemyIds.has(e.boss.summons)) {
        errors.push(`${tag}: boss.summons references unknown enemy "${e.boss.summons}"`);
      }
      if (e.boss.phases.length === 0) errors.push(`${tag}: boss must define phases`);
      let prev = 1.01;
      for (const [i, p] of e.boss.phases.entries()) {
        if (p.untilHpFraction >= prev) {
          errors.push(`${tag}: boss.phases[${i}] untilHpFraction must strictly decrease`);
        }
        prev = p.untilHpFraction;
      }
      if (e.boss.phases[e.boss.phases.length - 1]?.untilHpFraction !== 0) {
        errors.push(`${tag}: final boss phase must extend to untilHpFraction 0`);
      }
    }
  }
  const wave1Pickable = set.enemies.filter((e) => e.cost > 0 && e.weight > 0 && e.minWave <= 1);
  if (wave1Pickable.length === 0) {
    errors.push('enemies: no budget-pickable enemy available for wave 1');
  }

  // --- Upgrades ------------------------------------------------------------
  uniqueIds(errors, 'upgrades', set.upgrades.map((u) => u.id));
  for (const u of set.upgrades) {
    const tag = `upgrade "${u.id}"`;
    if (u.maxStacks < 1) errors.push(`${tag}: maxStacks must be >= 1`);
    const hasMods = (u.mods?.length ?? 0) > 0;
    const hasGrants = (u.grants?.length ?? 0) > 0;
    if (!hasMods && !hasGrants) {
      errors.push(`${tag}: must define at least one stat mod or ability grant`);
    }
    for (const m of u.mods ?? []) {
      if (m.add === undefined && m.mult === undefined) {
        errors.push(`${tag}: mod for "${m.stat}" needs add or mult`);
      }
    }
  }
  if (set.upgrades.length < 20) {
    warnings.push(`upgrades: pool has ${set.upgrades.length} entries; design target is >= 20`);
  }

  // --- Wave events / balance -------------------------------------------------
  uniqueIds(errors, 'waveEvents', set.waveEvents.map((w) => w.id));
  for (const ev of set.waveEvents) {
    const tag = `waveEvent "${ev.id}"`;
    nonNegative(errors, tag, 'weight', ev.weight);
    positive(errors, tag, 'budgetMult', ev.budgetMult);
    positive(errors, tag, 'minWave', ev.minWave);
  }
  if (set.balance.waves.bossEvery > 0 && !set.waveEvents.some((w) => w.id === 'boss')) {
    errors.push('waveEvents: bossEvery is set but no "boss" wave event exists');
  }

  const b = set.balance;
  positive(errors, 'balance.player', 'maxHealth', b.player.maxHealth);
  positive(errors, 'balance.player', 'walkSpeed', b.player.walkSpeed);
  positive(errors, 'balance.waves', 'baseBudget', b.waves.baseBudget);
  positive(errors, 'balance.waves', 'bossEvery', b.waves.bossEvery);
  positive(errors, 'balance.progression', 'xpBase', b.progression.xpBase);
  if (b.progression.xpGrowth <= 1) {
    errors.push('balance.progression: xpGrowth must be > 1');
  }
  if (b.waves.minSpawnDistance >= b.waves.maxSpawnDistance) {
    errors.push('balance.waves: minSpawnDistance must be < maxSpawnDistance');
  }
  positive(errors, 'balance.waves', 'paceTargetSecPerWave', b.waves.paceTargetSecPerWave);
  nonNegative(errors, 'balance.waves', 'weaponPowerBudgetFactor', b.waves.weaponPowerBudgetFactor);
  positive(errors, 'balance.waves', 'paceBudgetMin', b.waves.paceBudgetMin);
  if (b.waves.paceBudgetMin > b.waves.paceBudgetMax) {
    errors.push('balance.waves: paceBudgetMin must be <= paceBudgetMax');
  }

  return {
    errors,
    warnings,
    checked: {
      weapons: set.weapons.length,
      enemies: set.enemies.length,
      upgrades: set.upgrades.length,
      waveEvents: set.waveEvents.length,
    },
  };
}

export function validateAllConfigs(): ValidationReport {
  return validateConfigSet({
    weapons: WEAPONS,
    enemies: ENEMIES,
    upgrades: UPGRADES,
    waveEvents: WAVE_EVENTS,
    balance: BALANCE,
  });
}

/** Human-readable startup report for console + dev console. */
export function formatValidationReport(report: ValidationReport): string {
  const lines: string[] = [
    `Config validation: ${report.checked.weapons} weapons, ${report.checked.enemies} enemies, ` +
      `${report.checked.upgrades} upgrades, ${report.checked.waveEvents} wave events`,
  ];
  if (report.errors.length === 0 && report.warnings.length === 0) {
    lines.push('All configs valid.');
  }
  for (const e of report.errors) lines.push(`  ERROR: ${e}`);
  for (const w of report.warnings) lines.push(`  warn: ${w}`);
  return lines.join('\n');
}
